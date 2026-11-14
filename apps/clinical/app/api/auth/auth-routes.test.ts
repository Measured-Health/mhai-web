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
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/api")>()),
  api: (...a: unknown[]) => upstream(...a),
}));

import { UpstreamError } from "@/lib/server/api";
import { __resetRefreshCacheForTests, refreshOnce } from "@/lib/server/refresh";
import type { ApiUser } from "@/lib/api/auth-contract";
import {
  MFA_COOKIE,
  SESSION_COOKIE,
  TRUST_COOKIE,
  readSession,
} from "@/lib/server/session";
import { POST as login } from "./login/route";
import { POST as mfa } from "./mfa/route";
import { GET as session } from "./session/route";
import { POST as logout } from "./logout/route";
import { POST as password } from "./password/route";
import { POST as terms } from "./terms/route";
import { POST as setup } from "./mfa/setup/route";
import { POST as confirm } from "./mfa/setup/confirm/route";
import { POST as forgot } from "./password/forgot/route";
import { POST as reset } from "./password/reset/route";
import { GET as devices } from "./devices/route";
import { DELETE as dropDevice } from "./devices/[id]/route";
import { POST as signOutAll } from "./devices/sign-out-all/route";
import { POST as newCodes } from "./mfa/recovery-codes/route";
import { GET as oidcLogin } from "./oidc/login/route";
import { POST as oidcExchange } from "./oidc/exchange/route";

const post = (body?: unknown, origin = "http://demo.test") =>
  new Request("http://demo.test/api/auth/x", {
    method: "POST",
    headers: { "content-type": "application/json", host: "demo.test", origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const LOGIN_OK = {
  access_token: "tok",
  expires_in: 900,
  refresh_token: "rtok",
  user: { username: "a.reyes", role: "clinician", mfa_enabled: true },
};

beforeEach(() => {
  __resetRefreshCacheForTests();
  vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  jar.values.clear();
  upstream.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

async function signedIn(extra: Partial<ApiUser> = {}) {
  upstream.mockResolvedValueOnce({
    ...LOGIN_OK,
    user: { ...LOGIN_OK.user, ...extra },
  });
  await login(post({ login: "a.reyes", password: "pw" }));
}

describe("login", () => {
  it("signs in, sealing the token in a cookie the page never sees", async () => {
    upstream.mockResolvedValueOnce(LOGIN_OK);
    const res = await login(post({ login: " a.reyes ", password: "pw" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "signed_in",
      user: { username: "a.reyes" },
      steps: [],
    });
    expect(JSON.stringify(body)).not.toContain("tok");
    expect(upstream).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: { username: "a.reyes", password: "pw" },
    });
    expect(jar.values.get(SESSION_COOKIE)).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("keeps core's refresh token sealed in the session cookie, never in the reply", async () => {
    upstream.mockResolvedValueOnce(LOGIN_OK);
    const res = await login(post({ login: "a.reyes", password: "pw" }));
    expect(JSON.stringify(await res.json())).not.toContain("rtok");
    expect(jar.values.get(SESSION_COOKIE)).not.toContain("rtok");
    expect((await readSession())?.refreshToken).toBe("rtok");
  });
  it("mfa_enrolled false: takes core's enrolment-only session with an empty code", async () => {
    upstream.mockResolvedValueOnce({
      mfa_required: true,
      mfa_token: "m",
      mfa_enrolled: false,
    });
    upstream.mockResolvedValueOnce({
      ...LOGIN_OK,
      user: {
        ...LOGIN_OK.user,
        mfa_enabled: false,
        must_change_password: true,
      },
    });
    const res = await login(post({ login: "a", password: "pw" }));
    expect(await res.json()).toMatchObject({
      status: "signed_in",
      steps: ["password", "mfa", "terms"],
    });
    expect(upstream).toHaveBeenLastCalledWith("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: "m", code: "" },
    });
    expect(jar.values.get(MFA_COOKIE)).toBeUndefined();
  });
  it.each([[true], [undefined], ["false"], [0]])(
    "mfa_enrolled %j: asks for the code and never sends an empty one",
    async (enrolled) => {
      upstream.mockResolvedValueOnce({
        mfa_required: true,
        mfa_token: "m",
        ...(enrolled === undefined ? {} : { mfa_enrolled: enrolled }),
      });
      const res = await login(post({ login: "a", password: "pw" }));
      expect(await res.json()).toEqual({ status: "mfa_required" });
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(jar.values.get(MFA_COOKIE)).toBeTruthy();
    },
  );
  it("holds the MFA step token in its own cookie", async () => {
    upstream.mockResolvedValueOnce({ mfa_required: true, mfa_token: "m" });
    const res = await login(post({ login: "a", password: "pw" }));
    expect(await res.json()).toEqual({ status: "mfa_required" });
    expect(jar.values.get(MFA_COOKIE)).toBeTruthy();
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });
  it.each([
    [new UpstreamError(401, "unauthenticated"), 401, "invalid_credentials"],
    [new UpstreamError(429, "login_locked"), 429, "locked"],
    [new UpstreamError(503, "unavailable"), 503, "unavailable"],
  ])("maps %o", async (err, status, code) => {
    upstream.mockRejectedValueOnce(err);
    const res = await login(post({ login: "a", password: "pw" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code });
  });
  it("refuses another site's form", async () => {
    const res = await login(
      post({ login: "a", password: "pw" }, "https://evil.test"),
    );
    expect(res.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("mfa", () => {
  it("completes sign-in with the held MFA token", async () => {
    upstream.mockResolvedValueOnce({ mfa_required: true, mfa_token: "m" });
    await login(post({ login: "a", password: "pw" }));
    upstream.mockResolvedValueOnce(LOGIN_OK);
    const res = await mfa(
      post({ code: "123456", backup: false, trustDevice: false }),
    );
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: "m", code: "123456", trust_device: false },
    });
    expect(jar.values.get(MFA_COOKIE)).toBeUndefined();
  });
  it("says the step expired when nothing is held", async () => {
    const res = await mfa(
      post({ code: "123456", backup: false, trustDevice: false }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "mfa_expired" });
  });
});

describe("session, terms, password, logout", () => {
  it("reports the session and its steps, or 401", async () => {
    expect((await session()).status).toBe(401);
    await signedIn({ must_change_password: true });
    const res = await session();
    expect(await res.json()).toMatchObject({ steps: ["password", "terms"] });
  });
  it("clears first sign-in steps as they're done: password, then terms", async () => {
    await signedIn({ must_change_password: true });
    upstream.mockResolvedValueOnce(undefined);
    expect(
      (await password(post({ current: "temp-pw", next: "tram-lantern-okra" })))
        .status,
    ).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/password", {
      method: "POST",
      token: "tok",
      body: { current_password: "temp-pw", new_password: "tram-lantern-okra" },
    });
    upstream.mockResolvedValueOnce(undefined);
    expect((await terms(post())).status).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/terms", {
      method: "POST",
      token: "tok",
      body: { version: "2026-10" },
    });
    expect((await readSession())?.steps).toEqual([]);
  });
  it("the first password change needs the temporary password (core's current_password)", async () => {
    await signedIn({ must_change_password: true });
    for (const current of [null, ""]) {
      const res = await password(post({ current, next: "tram-lantern-okra" }));
      expect(res.status).toBe(400);
    }
    expect(upstream).toHaveBeenCalledTimes(1); // the sign-in only
  });
  it.each([
    [new UpstreamError(403, "forbidden"), 403, "wrong_password"],
    [new UpstreamError(422, "weak_password"), 422, "weak_password"],
    [new UpstreamError(429, "login_locked"), 429, "locked"],
  ])("maps core's password refusal %o", async (err, status, code) => {
    await signedIn();
    upstream.mockRejectedValueOnce(err);
    const res = await password(
      post({ current: "x", next: "tram-lantern-okra" }),
    );
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code });
  });
  it("terms refused for an enrolment-only session: refreshes, then retries once", async () => {
    await signedIn();
    upstream.mockRejectedValueOnce(new UpstreamError(403, "mfa_required"));
    upstream.mockResolvedValueOnce({
      access_token: "tok2",
      refresh_token: "rtok2",
      expires_in: 900,
    });
    upstream.mockResolvedValueOnce(undefined);
    expect((await terms(post())).status).toBe(204);
    expect(upstream).toHaveBeenCalledWith("/auth/refresh", {
      method: "POST",
      body: { refresh_token: "rtok" },
    });
    expect(upstream).toHaveBeenLastCalledWith("/auth/terms", {
      method: "POST",
      token: "tok2",
      body: { version: "2026-10" },
    });
    expect(await readSession()).toMatchObject({
      token: "tok2",
      refreshToken: "rtok2",
    });
  });
  it("calls a wrong current password what it is, and an ended session what it is", async () => {
    await signedIn();
    upstream.mockRejectedValueOnce(new UpstreamError(403, "forbidden"));
    const res = await password(
      post({ current: "nope", next: "tram-lantern-okra" }),
    );
    expect(await res.json()).toEqual({ code: "wrong_password" });
    for (const code of ["unauthenticated", "token_expired"]) {
      upstream.mockRejectedValueOnce(new UpstreamError(401, code));
      const r = await password(
        post({ current: "x", next: "tram-lantern-okra" }),
      );
      expect(await r.json()).toEqual({ code: "session_expired" });
    }
  });
  it("terms while the password or two-step is still owed: refused before core", async () => {
    for (const extra of [
      { mfa_enabled: false, terms_accepted_at: null },
      { must_change_password: true },
    ]) {
      upstream.mockReset();
      await signedIn(extra);
      upstream.mockClear();
      const res = await terms(post());
      expect(res.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    }
  });
  it("after sign-out a stale cookie no longer resolves to the successor", async () => {
    await signedIn();
    const old = jar.values.get(SESSION_COOKIE)!;
    upstream.mockResolvedValueOnce({
      access_token: "tok2",
      refresh_token: "rtok2",
      expires_in: 900,
    });
    await refreshOnce("rtok");
    upstream.mockResolvedValueOnce(undefined);
    expect((await logout(post())).status).toBe(204);
    jar.values.set(SESSION_COOKIE, old); // a stale copy of the old cookie
    // Neither the successor nor the old session: signed out.
    expect(await readSession()).toBeNull();
  });
  it("a refresh that finishes after sign-out writes no cookie", async () => {
    await signedIn({ mfa_enabled: false });
    let release!: (v: unknown) => void;
    upstream.mockResolvedValueOnce(undefined); // verify
    upstream.mockImplementationOnce(
      () => new Promise((res) => (release = res)),
    ); // the refresh after verify, still in flight
    const confirming = confirm(post({ code: "123456" }));
    await new Promise((r) => setTimeout(r, 0));
    upstream.mockResolvedValueOnce(undefined);
    await logout(post());
    release({ access_token: "tok2", refresh_token: "rtok2", expires_in: 900 });
    await confirming;
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });
  it("a route writing back the session after a rotation writes the successor, not the old pair", async () => {
    await signedIn({ must_change_password: true });
    upstream.mockResolvedValueOnce({
      access_token: "tok2",
      refresh_token: "rtok2",
      expires_in: 900,
    });
    expect((await refreshOnce("rtok"))?.refreshToken).toBe("rtok2");
    // The browser still sends the old cookie (the rotating reply hasn't
    // reached it yet): the password route writes the session back.
    upstream.mockResolvedValueOnce(undefined);
    await password(post({ current: "temp", next: "tram-lantern-okra" }));
    expect(await readSession()).toMatchObject({
      token: "tok2",
      refreshToken: "rtok2",
    });
  });
  it("needs a session for account changes", async () => {
    const res = await password(post({ current: "temp", next: "x".repeat(12) }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
  });
  it("signs out upstream and clears both cookies", async () => {
    await signedIn();
    upstream.mockResolvedValueOnce(undefined);
    expect((await logout(post())).status).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/logout", {
      method: "POST",
      token: "tok",
    });
    expect(jar.values.size).toBe(0);
  });
  it("still clears cookies when the upstream sign-out fails", async () => {
    await signedIn();
    upstream.mockRejectedValueOnce(new UpstreamError(503, "unavailable"));
    expect((await logout(post())).status).toBe(204);
    expect(jar.values.size).toBe(0);
  });
});

describe("two-step setup", () => {
  it("returns the QR URI, its secret and the codes, then confirms", async () => {
    await signedIn({ mfa_enabled: false });
    upstream.mockResolvedValueOnce({
      otpauth_uri:
        "otpauth://totp/MHAI:a.reyes?secret=ABCDEF234567&issuer=MHAI",
      recovery_codes: ["AAAA-1111"],
    });
    const res = await setup(post());
    expect(await res.json()).toEqual({
      otpauthUri: "otpauth://totp/MHAI:a.reyes?secret=ABCDEF234567&issuer=MHAI",
      secret: "ABCDEF234567",
      backupCodes: ["AAAA-1111"],
    });
    upstream.mockResolvedValueOnce(undefined);
    upstream.mockResolvedValueOnce({
      access_token: "tok2",
      refresh_token: "rtok2",
      expires_in: 900,
    });
    expect((await confirm(post({ code: "123456" }))).status).toBe(204);
    // Verify only marks the session; the next refresh mints a full token.
    expect(upstream).toHaveBeenLastCalledWith("/auth/refresh", {
      method: "POST",
      body: { refresh_token: "rtok" },
    });
    expect(await readSession()).toMatchObject({
      token: "tok2",
      refreshToken: "rtok2",
      user: { mfaEnabled: true },
      steps: [],
    });
  });
});

describe("assumed endpoints", () => {
  it("never reveals whether an email has an account", async () => {
    upstream.mockRejectedValueOnce(new UpstreamError(404, "not_found"));
    expect((await forgot(post({ email: "who@ever.org" }))).status).toBe(202);
    upstream.mockRejectedValueOnce(new UpstreamError(429, "rate_limited"));
    expect(await (await forgot(post({ email: "a@b.org" }))).json()).toEqual({
      code: "rate_limited",
    });
  });
  it("resets a password, and calls a dead link expired", async () => {
    upstream.mockResolvedValueOnce(undefined);
    expect(
      (await reset(post({ token: "t", next: "tram-lantern-okra" }))).status,
    ).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/password/reset", {
      method: "POST",
      body: { token: "t", new_password: "tram-lantern-okra" },
    });
    upstream.mockRejectedValueOnce(new UpstreamError(410, "token_expired"));
    expect(
      await (
        await reset(post({ token: "t", next: "tram-lantern-okra" }))
      ).json(),
    ).toEqual({
      code: "link_expired",
    });
  });
  it("lists, drops and revokes devices", async () => {
    await signedIn();
    // Core's SessionList (openapi 1.20.0): the network prefix never passes.
    upstream.mockResolvedValueOnce({
      sessions: [
        {
          id: "s1",
          created_at: "2026-10-15T07:00:00Z",
          last_seen_at: "2026-10-15T08:00:00Z",
          ua_summary: "Chrome on Windows",
          ip_prefix: "203.0.113.0/24",
          current: true,
        },
      ],
    });
    expect(await (await devices()).json()).toEqual([
      {
        id: "s1",
        label: "Chrome on Windows",
        place: null,
        lastActiveAt: Date.parse("2026-10-15T08:00:00Z"),
        current: true,
      },
    ]);
    upstream.mockResolvedValueOnce(undefined);
    const del = new Request("http://demo.test/api/auth/devices/s2", {
      method: "DELETE",
      headers: { host: "demo.test", origin: "http://demo.test" },
    });
    expect(
      (await dropDevice(del, { params: Promise.resolve({ id: "s2" }) })).status,
    ).toBe(204);
    expect(upstream).toHaveBeenLastCalledWith("/auth/sessions/s2", {
      method: "DELETE",
      token: "tok",
    });
    upstream.mockResolvedValueOnce(undefined);
    expect((await signOutAll(post())).status).toBe(204);
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });
  it("issues new backup codes and updates the count", async () => {
    await signedIn();
    upstream.mockResolvedValueOnce({ recovery_codes: ["A", "B"] });
    expect(await (await newCodes(post())).json()).toEqual({
      backupCodes: ["A", "B"],
    });
    expect((await readSession())?.user.backupCodesLeft).toBe(2);
  });
  it("trusts a device after two-step, and offers it at the next sign-in", async () => {
    upstream.mockResolvedValueOnce({ mfa_required: true, mfa_token: "m" });
    await login(post({ login: "a", password: "pw" }));
    upstream.mockResolvedValueOnce({ ...LOGIN_OK, device_token: "dev-1" });
    await mfa(post({ code: "123456", backup: false, trustDevice: true }));
    expect(upstream).toHaveBeenLastCalledWith("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: "m", code: "123456", trust_device: true },
    });
    expect(jar.values.get(TRUST_COOKIE)).toBeTruthy();
    upstream.mockResolvedValueOnce(LOGIN_OK);
    await login(post({ login: "a", password: "pw" }));
    expect(upstream).toHaveBeenLastCalledWith("/auth/login", {
      method: "POST",
      body: { username: "a", password: "pw", device_token: "dev-1" },
    });
  });
  // HTTP only: on NATS hospital sign-on is unavailable (the test below).
  it.runIf(process.env.BACKEND_TRANSPORT !== "nats")(
    "sends hospital sign-on to the API and back to our return page",
    async () => {
      vi.stubEnv("MHAI_API_URL", "http://api.test");
      const res = await oidcLogin(
        new Request("http://demo.test/api/auth/oidc/login", {
          headers: { host: "demo.test" },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "http://api.test/api/v1/auth/oidc/login?return_to=http%3A%2F%2Fdemo.test%2Fsign-in%2Fhospital",
      );
      upstream.mockRejectedValueOnce(new UpstreamError(400, "invalid_code"));
      expect(await (await oidcExchange(post({ code: "x" }))).json()).toEqual({
        code: "sso_failed",
      });
      upstream.mockResolvedValueOnce(LOGIN_OK);
      expect((await oidcExchange(post({ code: "good" }))).status).toBe(200);
    },
  );
  it("hospital sign-on is unavailable on NATS (no browser-facing core)", async () => {
    vi.stubEnv("BACKEND_TRANSPORT", "nats");
    const res = await oidcLogin(
      new Request("http://demo.test/api/auth/oidc/login", {
        headers: { host: "demo.test" },
      }),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Location")).toBeNull();
    expect(await res.json()).toEqual({ code: "unavailable" });
  });
  it("maps the smaller failure cases", async () => {
    upstream.mockRejectedValueOnce(new UpstreamError(422, "validation_failed"));
    expect((await forgot(post({ email: "bad" }))).status).toBe(202);
    upstream.mockRejectedValueOnce(new UpstreamError(503, "unavailable"));
    expect((await forgot(post({ email: "a@b.org" }))).status).toBe(503);
    upstream.mockRejectedValueOnce(new UpstreamError(422, "validation_failed"));
    const weak = await reset(post({ token: "t", next: "x" }));
    expect([weak.status, await weak.json()]).toEqual([
      422,
      { code: "weak_password" },
    ]);
    upstream.mockRejectedValueOnce(new UpstreamError(503, "unavailable"));
    expect((await oidcExchange(post({ code: "x" }))).status).toBe(503);
  });
  it("keeps forgot-password replies alike for every account state", async () => {
    upstream.mockRejectedValueOnce(new UpstreamError(403, "account_disabled"));
    expect((await forgot(post({ email: "a@b.org" }))).status).toBe(202);
    upstream.mockRejectedValueOnce(new UpstreamError(409, "x"));
    expect((await forgot(post({ email: "a@b.org" }))).status).toBe(202);
    upstream.mockRejectedValueOnce(new UpstreamError(500, "error"));
    const r = await forgot(post({ email: "a@b.org" }));
    expect([r.status, await r.json()]).toEqual([503, { code: "unavailable" }]);
  });
  it("never lets a device id rewrite the upstream path", async () => {
    await signedIn();
    upstream.mockClear();
    for (const id of ["..", ".", "s/2"]) {
      const res = await dropDevice(
        new Request("http://demo.test/api/auth/devices/x", {
          method: "DELETE",
          headers: { host: "demo.test", origin: "http://demo.test" },
        }),
        { params: Promise.resolve({ id }) },
      );
      expect([res.status, await res.json()]).toEqual([
        404,
        { code: "not_found" },
      ]);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("refuses cross-site writes and needs a session on the new routes", async () => {
    const evil = post({}, "https://evil.test");
    expect((await signOutAll(evil)).status).toBe(403);
    expect((await newCodes(post())).status).toBe(401);
    expect((await devices()).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});
