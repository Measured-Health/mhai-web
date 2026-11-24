// @vitest-environment node
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

import { SESSION_COOKIE } from "@/lib/server/session";
import { __resetRefreshCacheForTests } from "@/lib/server/refresh";
import { POST as login } from "../../login/route";
import { POST as start } from "./route";
import { POST as confirm } from "./confirm/route";

const fetchMock = vi.fn();
const reply = (body?: unknown, status = 200) =>
  body === undefined
    ? new Response(null, { status: 204 })
    : Response.json(body, { status });

// Synthetic: never a real key.
const SECRET = base32Encode("synthetic-test-key-1");
const CORE_URI = `otpauth://totp/MHAI:ada@measured-health.example?algorithm=SHA1&digits=6&issuer=MHAI&period=30&secret=${SECRET}`;
// One Idempotency-Key per run, made here (never a literal).
const KEY = crypto.randomUUID();
const ORIGIN = "http://platform.test";

const post = (
  body?: unknown,
  {
    origin = ORIGIN,
    key = KEY as string | null,
    raw,
  }: { origin?: string; key?: string | null; raw?: string } = {},
) =>
  new Request(`${ORIGIN}/api/auth/mfa/replace`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "platform.test",
      origin,
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });

type Call = [string, RequestInit];
const calls = () => fetchMock.mock.calls as Call[];
const lastCall = () => calls()[calls().length - 1]!;

beforeEach(() => {
  vi.stubEnv("PLATFORM_SESSION_SECRET", "p".repeat(40));
  vi.stubEnv("MHAI_API_URL", "http://api.test/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  jar.values.clear();
  __resetRefreshCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signedIn() {
  fetchMock.mockResolvedValueOnce(
    reply({
      access_token: "tok-123",
      expires_in: 3600,
      refresh_token: "rtok-123",
      user: {
        username: "ada@measured-health.example",
        email: "ada@measured-health.example",
        display_name: "Ada",
        role: "admin",
        roles: ["admin"],
        mfa_enabled: true,
        must_change_password: false,
        terms_accepted_at: "2026-10-01T00:00:00Z",
        recovery_codes_left: 8,
      },
    }),
  );
  const res = await login(
    post({ login: "ada@measured-health.example", password: "pw" }),
  );
  expect(res.status).toBe(200);
  fetchMock.mockReset();
}

describe("POST /api/auth/mfa/replace", () => {
  it("sends exactly the step-up, with its key and the platform audience", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(reply({ otpauth_uri: CORE_URI }));
    const res = await start(post({ backup_code: "ppppp-qqqqq" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      otpauthUri: `otpauth://totp/MHAI:ada%40measured-health.example?secret=${SECRET}&issuer=MHAI&algorithm=SHA1&digits=6&period=30`,
      secret: SECRET,
    });
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/auth/mfa/replace");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      backup_code: "ppppp-qqqqq",
    });
    const h = new Headers(init.headers);
    expect(h.get("Authorization")).toBe("Bearer tok-123");
    expect(h.get("Idempotency-Key")).toBe(KEY);
    expect(h.get("X-MHAI-Audience")).toBe("platform");
  });

  it.each([
    ["no key", post({ mfa_code: "123456" }, { key: null })],
    ["an extra field", post({ mfa_code: "123456", role: "admin" })],
    ["both codes", post({ mfa_code: "123456", backup_code: "ppppp-qqqqq" })],
    ["a code in the wrong field", post({ code: "123456" })],
    ["not JSON", post(undefined, { raw: "{" })],
  ])("refuses %s before upstream", async (_, req) => {
    await signedIn();
    const res = await start(req);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses another origin and a missing session before upstream", async () => {
    await signedIn();
    const evil = await start(
      post({ mfa_code: "123456" }, { origin: "https://evil.test" }),
    );
    expect(evil.status).toBe(403);
    jar.values.delete(SESSION_COOKIE);
    expect((await start(post({ mfa_code: "123456" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ otpauth_uri: CORE_URI, secret: SECRET }],
    [{ otpauth_uri: CORE_URI.replace("digits=6", "digits=8") }],
    [{ otpauth_uri: CORE_URI.replace("otpauth://totp/", "otpauth://hotp/") }],
    [{ otpauth_uri: CORE_URI.replace(SECRET, "not-base32") }],
  ])("an unexpected reply %j never reaches the page", async (body) => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(reply(body));
    const res = await start(post({ mfa_code: "123456" }));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"code":"unavailable"}');
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
    fetchMock.mockResolvedValueOnce(
      reply({ code: c, detail: "never shown" }, s),
    );
    const res = await start(post({ mfa_code: "123456" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code });
  });
});

describe("POST /api/auth/mfa/replace/confirm", () => {
  it("confirms with the new app's code and its key", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(reply());
    const res = await confirm(post({ code: "654321" }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/auth/mfa/replace/confirm");
    expect(JSON.parse(String(init.body))).toEqual({ code: "654321" });
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(KEY);
  });

  it.each([
    ["no key", post({ code: "654321" }, { key: null })],
    ["an extra field", post({ code: "654321", mfa_code: "123456" })],
    ["a short code", post({ code: "6543" })],
  ])("refuses %s before upstream", async (_, req) => {
    await signedIn();
    expect((await confirm(req)).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [409, "conflict", 409, "conflict"],
    [403, "mfa_invalid", 403, "mfa_invalid"],
    [429, "mfa_locked", 429, "mfa_locked"],
    [500, "internal_error", 503, "unavailable"],
  ])("upstream %i %s is %i %s", async (s, c, status, code) => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(reply({ code: c }, s));
    const res = await confirm(post({ code: "654321" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code });
  });
});
