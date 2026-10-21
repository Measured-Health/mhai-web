import { describe, expect, it, vi } from "vitest";
import { createLiveAuthClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );
const call = (f: ReturnType<typeof reply>, i = 0) => {
  const [url, init] = f.mock.calls[i] as unknown as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
};

describe("live auth client", () => {
  it("signs in through the app's own routes", async () => {
    const fetchImpl = reply(200, { status: "mfa_required" });
    const c = createLiveAuthClient({ fetchImpl });
    expect(await c.signIn("ada@x.example", "pw")).toEqual({
      status: "mfa_required",
    });
    expect(call(fetchImpl)).toEqual({
      url: "/api/auth/login",
      method: "POST",
      body: { login: "ada@x.example", password: "pw" },
    });
  });

  it("turns 403 not_platform into a not_platform result", async () => {
    const c = createLiveAuthClient({
      fetchImpl: reply(403, { code: "not_platform" }),
    });
    expect(await c.signIn("a@h.example", "pw")).toEqual({
      status: "not_platform",
    });
    expect(await c.verifyCode("123456", { backup: false })).toEqual({
      status: "not_platform",
    });
  });

  it("sends the code with backup and never a trust option", async () => {
    const fetchImpl = reply(200, { status: "signed_in", user: {}, steps: [] });
    await createLiveAuthClient({ fetchImpl }).verifyCode("123456", {
      backup: false,
    });
    expect(call(fetchImpl)).toEqual({
      url: "/api/auth/mfa",
      method: "POST",
      body: { code: "123456", backup: false },
    });
  });

  it("passes known error codes through and hides unknown ones", async () => {
    await expect(
      createLiveAuthClient({
        fetchImpl: reply(429, { code: "mfa_locked" }),
      }).verifyCode("1", { backup: false }),
    ).rejects.toMatchObject({ code: "mfa_locked" });
    await expect(
      createLiveAuthClient({
        fetchImpl: reply(500, { code: "kaboom" }),
      }).signIn("a", "b"),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      createLiveAuthClient({
        fetchImpl: vi.fn(async () => {
          throw new TypeError("offline");
        }),
      }).signIn("a", "b"),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("keep-alive POSTs /api/auth/session; 401 is session_expired", async () => {
    const ok = reply(204);
    await expect(
      createLiveAuthClient({ fetchImpl: ok }).keepAlive(),
    ).resolves.toBeUndefined();
    expect(call(ok)).toMatchObject({
      url: "/api/auth/session",
      method: "POST",
    });
    await expect(
      createLiveAuthClient({
        fetchImpl: reply(401, { code: "session_expired" }),
      }).keepAlive(),
    ).rejects.toMatchObject({ code: "session_expired" });
  });

  it("reads the session with GET; a 401 means nobody", async () => {
    const f = reply(401, { code: "session_expired" });
    expect(
      await createLiveAuthClient({ fetchImpl: f }).getSession(),
    ).toBeNull();
    expect(call(f).method).toBe("GET");
  });

  it("signs out everywhere: each other device, then this one", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/devices" && init?.method === "GET")
        return Response.json([
          { id: "this", current: true },
          { id: "phone_1", current: false },
        ]);
      return new Response(null, { status: 204 });
    });
    await createLiveAuthClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).signOutEverywhere();
    const calls = fetchImpl.mock.calls.map(
      ([u, i]) => `${(i as RequestInit).method} ${u}`,
    );
    expect(calls).toEqual([
      "GET /api/auth/devices",
      "DELETE /api/auth/devices/phone_1",
      "POST /api/auth/logout",
    ]);
  });
});
