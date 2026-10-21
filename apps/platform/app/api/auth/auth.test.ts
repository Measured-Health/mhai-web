// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { MFA_COOKIE, SESSION_COOKIE, readSession } from "@/lib/server/session";
import { POST as login } from "./login/route";
import { POST as mfa } from "./mfa/route";
import { POST as setup } from "./mfa/setup/route";
import { POST as confirm } from "./mfa/setup/confirm/route";
import { POST as newCodes } from "./mfa/recovery-codes/route";
import { POST as password } from "./password/route";
import { POST as terms } from "./terms/route";
import { GET as session, POST as keepAlive } from "./session/route";
import { POST as logout } from "./logout/route";
import { GET as devices } from "./devices/route";
import { DELETE as dropDevice } from "./devices/[id]/route";

const fetchMock = vi.fn();
const reply = (body?: unknown, status = 200) =>
  body === undefined
    ? new Response(null, { status: 204 })
    : Response.json(body, { status });

const ORIGIN = "http://platform.test";
const post = (body?: unknown, origin = ORIGIN) =>
  new Request(`${ORIGIN}/api/auth/x`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "platform.test",
      origin,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const del = (id: string, origin = ORIGIN) =>
  new Request(`${ORIGIN}/api/auth/devices/${id}`, {
    method: "DELETE",
    headers: { host: "platform.test", origin },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const ADMIN = {
  username: "ada@measured-health.example",
  email: "ada@measured-health.example",
  display_name: "Ada",
  role: "admin",
  roles: ["admin"],
  mfa_enabled: true,
  must_change_password: false,
  terms_accepted_at: "2026-10-01T00:00:00Z" as string | null,
  recovery_codes_left: 8,
};
const LOGIN_OK = { access_token: "tok-123", expires_in: 3600, user: ADMIN };
const CLINICIAN = {
  ...LOGIN_OK,
  access_token: "tok-clin",
  user: {
    ...ADMIN,
    role: "clinician",
    roles: ["clinician", "hospital_admin"],
  },
};

type Call = [string, RequestInit];
const calls = () => fetchMock.mock.calls as Call[];
const lastCall = () => calls()[calls().length - 1];
const bodyOf = (c: Call) => JSON.parse(String(c[1].body));

beforeEach(() => {
  vi.stubEnv("PLATFORM_SESSION_SECRET", "p".repeat(40));
  vi.stubEnv("MHAI_API_URL", "http://api.test/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  jar.values.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signedIn(user: Partial<typeof ADMIN> = {}) {
  fetchMock.mockResolvedValueOnce(
    reply({ ...LOGIN_OK, user: { ...ADMIN, ...user } }),
  );
  const res = await login(post({ login: ADMIN.email, password: "pw" }));
  expect(res.status).toBe(200);
  return res;
}

describe("login", () => {
  it("signs in a platform admin with the token sealed away", async () => {
    const res = await signedIn();
    const body = await res.json();
    expect(body).toEqual({
      status: "signed_in",
      user: {
        id: ADMIN.username,
        email: ADMIN.email,
        name: "Ada",
        roles: ["platform_admin"],
        mfaEnabled: true,
        backupCodesLeft: 8,
      },
      steps: [],
    });
    expect(JSON.stringify(body)).not.toContain("tok-123");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(await readSession()).toMatchObject({ token: "tok-123" });
  });

  it("login as a clinician account returns 403 not_platform and clears the cookie", async () => {
    await signedIn(); // an earlier platform session in the same browser
    fetchMock.mockResolvedValueOnce(reply(CLINICIAN));
    fetchMock.mockResolvedValueOnce(reply());
    fetchMock.mockResolvedValueOnce(reply());
    const res = await login(
      post({ login: "c@hospital.example", password: "pw" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_platform" });
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
    expect(jar.values.get(MFA_COOKIE)).toBeUndefined();
    // Signed out upstream at once with the token it was just given.
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/auth/logout");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer tok-clin",
    );
    // The earlier platform session's token is revoked too.
    const revoked = calls()
      .filter(([u]) => u.endsWith("/auth/logout"))
      .map(([, i]) => new Headers(i.headers).get("Authorization"));
    expect(revoked).toEqual(["Bearer tok-123", "Bearer tok-clin"]);
  });

  it("a new sign-in revokes the platform session it replaces", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(
      reply({ ...LOGIN_OK, access_token: "tok-456" }),
    );
    fetchMock.mockResolvedValueOnce(reply());
    const res = await login(post({ login: ADMIN.email, password: "pw" }));
    expect(res.status).toBe(200);
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/auth/logout");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer tok-123",
    );
    expect(await readSession()).toMatchObject({ token: "tok-456" });
  });

  it.each([
    [{ code: "forbidden" }, 403],
    [{ code: "not_platform" }, 403],
  ])("maps an upstream refusal %o to 403 not_platform", async (p, st) => {
    fetchMock.mockResolvedValueOnce(reply(p, st));
    const res = await login(post({ login: "a", password: "pw" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_platform" });
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("login never sends a device token", async () => {
    jar.values.set("mhai_trusted", "something-left-by-the-clinical-app");
    fetchMock.mockResolvedValueOnce(
      reply({ mfa_required: true, mfa_token: "m" }),
    );
    const res = await login(
      post({ login: ADMIN.email, password: "pw", device_token: "d-1" }),
    );
    expect(await res.json()).toEqual({ status: "mfa_required" });
    expect(bodyOf(lastCall())).toEqual({
      username: ADMIN.email,
      password: "pw",
    });
    expect(jar.values.get(MFA_COOKIE)).toBeTruthy();
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects a malformed body without calling upstream", async () => {
    expect((await login(post({ login: "", password: "pw" }))).status).toBe(400);
    expect((await login(post("nope"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps upstream failures to codes only", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ code: "unauthenticated", detail: "secret" }, 401),
    );
    const res = await login(post({ login: "a", password: "pw" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "invalid_credentials" });
  });
});

describe("mfa", () => {
  async function pending() {
    fetchMock.mockResolvedValueOnce(
      reply({ mfa_required: true, mfa_token: "m" }),
    );
    await login(post({ login: ADMIN.email, password: "pw" }));
  }

  it("mfa route ignores a trust_device field", async () => {
    await pending();
    fetchMock.mockResolvedValueOnce(
      reply({ ...LOGIN_OK, device_token: "dev-1" }),
    );
    const res = await mfa(
      post({
        code: "123456",
        backup: false,
        trust_device: true,
        trustDevice: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(bodyOf(lastCall())).toEqual({ mfa_token: "m", code: "123456" });
    expect(lastCall()[0]).toBe("http://api.test/api/v1/auth/mfa/challenge");
    // Only the session cookie: no trust cookie, and the step token is gone.
    expect([...jar.values.keys()]).toEqual([SESSION_COOKIE]);
    expect(JSON.stringify(await res.json())).not.toContain("dev-1");
  });

  it("signs out a non-platform account after two-step", async () => {
    await pending();
    fetchMock.mockResolvedValueOnce(reply(CLINICIAN));
    fetchMock.mockResolvedValueOnce(reply());
    const res = await mfa(post({ code: "123456", backup: false }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_platform" });
    expect(jar.values.size).toBe(0);
    expect(lastCall()[0]).toBe("http://api.test/api/v1/auth/logout");
  });

  it("passes too many wrong codes through as 429 mfa_locked", async () => {
    await pending();
    fetchMock.mockResolvedValueOnce(reply({ code: "mfa_locked" }, 429));
    const res = await mfa(post({ code: "000000", backup: false }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "mfa_locked" });
  });

  it("maps an upstream not_platform after two-step to 403", async () => {
    await pending();
    fetchMock.mockResolvedValueOnce(reply({ code: "not_platform" }, 403));
    const res = await mfa(post({ code: "123456", backup: false }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_platform" });
  });

  it("says the step expired when nothing is held", async () => {
    const res = await mfa(post({ code: "123456", backup: false }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "mfa_expired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("session", () => {
  it("reports the user and steps, never the token", async () => {
    await signedIn({ mfa_enabled: false });
    const res = await session();
    const body = await res.json();
    expect(body).toMatchObject({
      steps: ["mfa"],
      user: { mfaEnabled: false },
    });
    expect(JSON.stringify(body)).not.toContain("tok-123");
  });

  it("session GET after idle returns 401 session_expired and clears the cookie", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-20T09:00:00Z"));
    await signedIn();
    vi.setSystemTime(Date.parse("2026-10-20T09:15:01Z"));
    fetchMock.mockResolvedValueOnce(reply());
    const res = await session();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
    // The idle token is only ever used to revoke itself.
    expect(lastCall()[0]).toBe("http://api.test/api/v1/auth/logout");
  });

  it("refuses account changes on an idle session before calling upstream", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-20T09:00:00Z"));
    await signedIn();
    vi.setSystemTime(Date.parse("2026-10-20T09:15:01Z"));
    fetchMock.mockReset();
    const res = await password(post({ current: "a", next: "b".repeat(12) }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a write keeps the session alive", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-20T09:00:00Z"));
    await signedIn();
    vi.setSystemTime(Date.parse("2026-10-20T09:14:00Z"));
    fetchMock.mockResolvedValueOnce(reply({ recovery_codes: ["A"] }));
    expect((await newCodes(post())).status).toBe(200);
    vi.setSystemTime(Date.parse("2026-10-20T09:28:00Z"));
    expect((await session()).status).toBe(200);
  });
});

describe("keep-alive", () => {
  const T = (hm: string) => Date.parse(`2026-10-20T${hm}:00Z`);

  it("keep-alive moves lastSeenAt and returns 204", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T("09:00"));
    await signedIn();
    fetchMock.mockReset();
    vi.setSystemTime(T("09:14"));
    const res = await keepAlive(post());
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await readSession())?.lastSeenAt).toBe(T("09:14"));
    vi.setSystemTime(T("09:28"));
    expect(await readSession()).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keep-alive on an idle session is 401 and never calls upstream", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T("09:00"));
    await signedIn();
    fetchMock.mockReset();
    vi.setSystemTime(Date.parse("2026-10-20T09:15:01Z"));
    const res = await keepAlive(post());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keep-alive cross-origin is 403", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T("09:00"));
    await signedIn();
    vi.setSystemTime(T("09:10"));
    const res = await keepAlive(post(undefined, "https://evil.test"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "forbidden" });
    expect((await readSession())?.lastSeenAt).toBe(T("09:00"));
  });

  it("viewing devices counts as activity", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T("09:00"));
    await signedIn();
    vi.setSystemTime(T("09:14"));
    fetchMock.mockResolvedValueOnce(reply([]));
    expect((await devices()).status).toBe(200);
    expect((await readSession())?.lastSeenAt).toBe(T("09:14"));
  });
});

describe("first sign-in and account", () => {
  it("clears the steps as they're done", async () => {
    await signedIn({
      must_change_password: true,
      terms_accepted_at: null,
      mfa_enabled: false,
    });
    expect((await readSession())?.steps).toEqual(["password", "terms", "mfa"]);

    fetchMock.mockResolvedValueOnce(reply());
    expect(
      (await password(post({ current: null, next: "tram-lantern-okra" })))
        .status,
    ).toBe(204);
    expect(bodyOf(lastCall())).toEqual({
      current_password: null,
      new_password: "tram-lantern-okra",
    });

    fetchMock.mockResolvedValueOnce(reply());
    expect((await terms(post())).status).toBe(204);
    expect(bodyOf(lastCall())).toEqual({ version: "2026-10" });

    fetchMock.mockResolvedValueOnce(
      reply({
        otpauth_uri: "otpauth://totp/MHAI:ada?secret=ABCDEF234567&issuer=MHAI",
        recovery_codes: ["AAAA-1111"],
      }),
    );
    expect(await (await setup(post())).json()).toEqual({
      otpauthUri: "otpauth://totp/MHAI:ada?secret=ABCDEF234567&issuer=MHAI",
      secret: "ABCDEF234567",
      backupCodes: ["AAAA-1111"],
    });
    fetchMock.mockResolvedValueOnce(reply());
    expect((await confirm(post({ code: "123456" }))).status).toBe(204);
    expect(await readSession()).toMatchObject({
      user: { mfaEnabled: true },
      steps: [],
    });
  });

  it("issues new backup codes, lists and drops devices", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(reply({ recovery_codes: ["A", "B"] }));
    expect(await (await newCodes(post())).json()).toEqual({
      backupCodes: ["A", "B"],
    });
    expect((await readSession())?.user.backupCodesLeft).toBe(2);

    fetchMock.mockResolvedValueOnce(
      reply([
        {
          id: "s1",
          device: "Firefox on Mac",
          location: "Lagos",
          last_seen_at: "2026-10-15T08:00:00Z",
          current: true,
        },
      ]),
    );
    expect(await (await devices()).json()).toEqual([
      {
        id: "s1",
        label: "Firefox on Mac",
        place: "Lagos",
        lastActiveAt: Date.parse("2026-10-15T08:00:00Z"),
        current: true,
      },
    ]);

    fetchMock.mockResolvedValueOnce(reply());
    expect((await dropDevice(del("s2"), params("s2"))).status).toBe(204);
    expect(lastCall()[0]).toBe("http://api.test/api/v1/auth/sessions/s2");
    expect(lastCall()[1].method).toBe("DELETE");
    fetchMock.mockReset();
    expect((await dropDevice(del(".."), params(".."))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs out upstream and clears both cookies", async () => {
    await signedIn();
    fetchMock.mockResolvedValueOnce(reply({ code: "unavailable" }, 503));
    expect((await logout(post())).status).toBe(204);
    expect(lastCall()[0]).toBe("http://api.test/api/v1/auth/logout");
    expect(jar.values.size).toBe(0);
  });
});

describe("guards", () => {
  it("a cross-origin POST is 403", async () => {
    await signedIn();
    fetchMock.mockReset();
    const evil = "https://evil.test";
    const responses = await Promise.all([
      login(post({ login: "a", password: "pw" }, evil)),
      mfa(post({ code: "123456", backup: false }, evil)),
      setup(post(undefined, evil)),
      confirm(post({ code: "123456" }, evil)),
      newCodes(post(undefined, evil)),
      password(post({ current: null, next: "x".repeat(12) }, evil)),
      terms(post(undefined, evil)),
      logout(post(undefined, evil)),
      dropDevice(del("s2", evil), params("s2")),
      // No Origin header at all.
      login(
        new Request(`${ORIGIN}/api/auth/login`, {
          method: "POST",
          headers: { host: "platform.test" },
          body: "{}",
        }),
      ),
    ]);
    for (const r of responses) {
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ code: "forbidden" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readSession()).not.toBeNull();
  });

  it("every upstream call carries X-MHAI-Audience: platform", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ mfa_required: true, mfa_token: "m" }),
    );
    await login(post({ login: ADMIN.email, password: "pw" }));
    fetchMock.mockResolvedValueOnce(
      reply({ ...LOGIN_OK, user: { ...ADMIN, must_change_password: true } }),
    );
    await mfa(post({ code: "123456", backup: false }));
    fetchMock.mockResolvedValueOnce(reply());
    await password(post({ current: null, next: "tram-lantern-okra" }));
    fetchMock.mockResolvedValueOnce(reply());
    await terms(post());
    fetchMock.mockResolvedValueOnce(
      reply({ otpauth_uri: "otpauth://totp/x?secret=A", recovery_codes: [] }),
    );
    await setup(post());
    fetchMock.mockResolvedValueOnce(reply());
    await confirm(post({ code: "123456" }));
    fetchMock.mockResolvedValueOnce(reply({ recovery_codes: [] }));
    await newCodes(post());
    fetchMock.mockResolvedValueOnce(reply([]));
    await devices();
    fetchMock.mockResolvedValueOnce(reply());
    await dropDevice(del("s2"), params("s2"));
    fetchMock.mockResolvedValueOnce(reply());
    await logout(post());
    fetchMock.mockResolvedValueOnce(reply(CLINICIAN));
    fetchMock.mockResolvedValueOnce(reply());
    await login(post({ login: "c", password: "pw" }));

    const paths = calls().map(([url]) => new URL(url).pathname);
    expect(paths).toEqual([
      "/api/v1/auth/login",
      "/api/v1/auth/mfa/challenge",
      "/api/v1/auth/password",
      "/api/v1/auth/terms",
      "/api/v1/auth/mfa/enroll",
      "/api/v1/auth/mfa/verify",
      "/api/v1/auth/mfa/recovery-codes",
      "/api/v1/auth/sessions",
      "/api/v1/auth/sessions/s2",
      "/api/v1/auth/logout",
      "/api/v1/auth/login",
      "/api/v1/auth/logout",
    ]);
    for (const [, init] of calls())
      expect(new Headers(init.headers).get("X-MHAI-Audience")).toBe("platform");
  });
});
