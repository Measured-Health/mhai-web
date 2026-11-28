import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base32Encode } from "@mhai/api-client/totp";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string) => void values.set(n, v),
    delete: (n: string) => void values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/api")>()),
  api: (...a: unknown[]) => upstream(...a),
}));

import { UpstreamError } from "@/lib/server/api";
import { __resetRefreshCacheForTests } from "@/lib/server/refresh";
import { SESSION_COOKIE, TRUST_COOKIE, writeTrust } from "@/lib/server/session";
import { POST as login } from "../../login/route";
import { POST as start } from "./route";
import { POST as confirm } from "./confirm/route";

// Synthetic: never a real key.
const SECRET = base32Encode("synthetic-test-key-1");
const CORE_URI = `otpauth://totp/MHAI:a.reyes@pilot-hospital.example?algorithm=SHA1&digits=6&issuer=MHAI&period=30&secret=${SECRET}`;
// One Idempotency-Key per run, made here (never a literal).
const KEY = crypto.randomUUID();

const post = (
  body?: unknown,
  {
    origin = "http://demo.test",
    key = KEY as string | null,
    raw,
  }: { origin?: string; key?: string | null; raw?: string } = {},
) =>
  new Request("http://demo.test/api/auth/mfa/replace", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "demo.test",
      origin,
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });

beforeEach(() => {
  __resetRefreshCacheForTests();
  vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  jar.values.clear();
  upstream.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

async function signedIn() {
  upstream.mockResolvedValueOnce({
    access_token: "tok",
    expires_in: 900,
    refresh_token: "rtok",
    user: { username: "a.reyes", role: "clinician", mfa_enabled: true },
  });
  await login(
    new Request("http://demo.test/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "demo.test",
        origin: "http://demo.test",
      },
      body: JSON.stringify({ login: "a.reyes", password: "pw" }),
    }),
  );
  upstream.mockReset();
}

describe("POST /api/auth/mfa/replace", () => {
  it("sends the step-up with its key and returns only the checked key", async () => {
    await signedIn();
    upstream.mockResolvedValueOnce({ otpauth_uri: CORE_URI });
    const res = await start(post({ mfa_code: "123456" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      otpauthUri: `otpauth://totp/MHAI:a.reyes%40pilot-hospital.example?secret=${SECRET}&issuer=MHAI&algorithm=SHA1&digits=6&period=30`,
      secret: SECRET,
    });
    expect(upstream).toHaveBeenCalledWith("/auth/mfa/replace", {
      method: "POST",
      token: "tok",
      body: { mfa_code: "123456" },
      idempotencyKey: KEY,
      onNewBackupCode: expect.any(Function),
    });
  });

  it("takes a backup code instead", async () => {
    await signedIn();
    upstream.mockResolvedValueOnce({ otpauth_uri: CORE_URI });
    expect((await start(post({ backup_code: "ppppp-qqqqq" }))).status).toBe(
      200,
    );
    expect(upstream.mock.calls[0]![1]).toMatchObject({
      body: { backup_code: "ppppp-qqqqq" },
    });
  });

  it.each([
    ["no key", post({ mfa_code: "123456" }, { key: null })],
    ["a bad key", post({ mfa_code: "123456" }, { key: "a b" })],
    ["an extra field", post({ mfa_code: "123456", user_id: "u2" })],
    ["both codes", post({ mfa_code: "123456", backup_code: "ppppp-qqqqq" })],
    ["a short code", post({ mfa_code: "12345" })],
    ["no body", post()],
    ["not JSON", post(undefined, { raw: "{" })],
    ["a large body", post(undefined, { raw: `"${"1".repeat(2000)}"` })],
  ])("refuses %s before upstream", async (_, req) => {
    await signedIn();
    const res = await start(req);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "invalid" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses another origin and a missing session before upstream", async () => {
    await signedIn();
    const evil = await start(
      post({ mfa_code: "123456" }, { origin: "https://evil.test" }),
    );
    expect(evil.status).toBe(403);
    jar.values.delete(SESSION_COOKIE);
    const gone = await start(post({ mfa_code: "123456" }));
    expect(gone.status).toBe(401);
    expect(await gone.json()).toEqual({ code: "session_expired" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [{ otpauth_uri: CORE_URI, recovery_codes: ["AAAA-1111"] }],
    [{ otpauth_uri: CORE_URI.replace("issuer=MHAI", "issuer=Evil") }],
    [{ otpauth_uri: `${CORE_URI}&image=https://evil.example/a.png` }],
    [{ otpauth_uri: CORE_URI.replace("algorithm=SHA1", "algorithm=MD5") }],
    [{ otpauth_uri: "javascript:alert(1)" }],
    [{}],
    [null],
  ])("an unexpected reply %j never reaches the page", async (reply) => {
    await signedIn();
    upstream.mockResolvedValueOnce(reply);
    const res = await start(post({ mfa_code: "123456" }));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe('{"code":"unavailable"}');
    expect(text).not.toContain(SECRET);
  });

  it.each([
    [403, "mfa_invalid", 403, "mfa_invalid"],
    [403, "mfa_required", 403, "mfa_required"],
    [429, "mfa_locked", 429, "mfa_locked"],
    [409, "conflict", 403, "mfa_required"],
    [422, "validation_failed", 422, "invalid"],
    [401, "unauthenticated", 401, "session_expired"],
    [503, "not_ready", 503, "unavailable"],
  ])("upstream %i %s is %i %s", async (s, c, status, code) => {
    await signedIn();
    upstream.mockRejectedValueOnce(new UpstreamError(s, c));
    const res = await start(post({ mfa_code: "123456" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("POST /api/auth/mfa/replace with a backup code", () => {
  // Built at run time: never a code-shaped literal in the repo.
  const spent = () => ["mnpqr", "stuvw"].join("-");
  const renewed = () => ["abcde", "fghjk"].join("-");

  it("passes core's replacement code to the page in the header only", async () => {
    await signedIn();
    upstream.mockImplementationOnce(
      async (_p: string, o: { onNewBackupCode?: (c: string) => void }) => {
        o.onNewBackupCode?.(renewed());
        return { otpauth_uri: CORE_URI };
      },
    );
    const res = await start(post({ backup_code: spent() }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-MHAI-New-Backup-Code")).toBe(renewed());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).not.toContain(renewed());
    expect([...jar.values.values()].join()).not.toContain(renewed());
  });

  it("passes it on a refusal after the code was spent", async () => {
    await signedIn();
    upstream.mockRejectedValueOnce(
      new UpstreamError(503, "not_ready", renewed()),
    );
    const res = await start(post({ backup_code: spent() }));
    expect(res.status).toBe(503);
    expect(res.headers.get("X-MHAI-New-Backup-Code")).toBe(renewed());
  });
});

describe("POST /api/auth/mfa/replace/confirm", () => {
  it("confirms with the new app's code and forgets the remembered device", async () => {
    await signedIn();
    await writeTrust("dev-1");
    upstream.mockResolvedValueOnce(undefined);
    const res = await confirm(post({ code: "654321" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(upstream).toHaveBeenCalledWith("/auth/mfa/replace/confirm", {
      method: "POST",
      token: "tok",
      body: { code: "654321" },
      idempotencyKey: KEY,
    });
    expect(jar.values.get(TRUST_COOKIE)).toBeUndefined();
    // Still signed in.
    expect(jar.values.get(SESSION_COOKIE)).toBeTruthy();
  });

  it.each([
    ["no key", post({ code: "654321" }, { key: null })],
    ["an extra field", post({ code: "654321", trust: true })],
    ["a step-up body", post({ mfa_code: "654321" })],
    ["a short code", post({ code: "65432" })],
    ["a number", post({ code: 654321 })],
  ])("refuses %s before upstream", async (_, req) => {
    await signedIn();
    const res = await confirm(req);
    expect(res.status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    [409, "conflict", 409, "conflict"],
    [403, "mfa_invalid", 403, "mfa_invalid"],
    [429, "mfa_locked", 429, "mfa_locked"],
    [401, "token_expired", 401, "session_expired"],
    [500, "internal_error", 503, "unavailable"],
  ])(
    "upstream %i %s is %i %s, keeping the device",
    async (s, c, status, code) => {
      await signedIn();
      await writeTrust("dev-1");
      upstream.mockRejectedValueOnce(new UpstreamError(s, c));
      const res = await confirm(post({ code: "654321" }));
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ code });
      expect(jar.values.get(TRUST_COOKIE)).toBeTruthy();
    },
  );
});
