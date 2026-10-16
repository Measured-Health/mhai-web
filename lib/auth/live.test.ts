import { describe, expect, it, vi } from "vitest";
import { LIVE_CAPABILITIES, createLiveAuthClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );

describe("live auth client", () => {
  it("turns every capability on", () => {
    expect(Object.values(LIVE_CAPABILITIES).every(Boolean)).toBe(true);
  });
  it("signs in through the BFF", async () => {
    const fetchImpl = reply(200, { status: "mfa_required" });
    const c = createLiveAuthClient({ fetchImpl });
    expect(await c.signIn("a.reyes", "pw")).toEqual({ status: "mfa_required" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(String(init.body))).toEqual({
      login: "a.reyes",
      password: "pw",
    });
  });
  it("passes known error codes through and hides unknown ones", async () => {
    await expect(
      createLiveAuthClient({
        fetchImpl: reply(429, { code: "locked" }),
      }).signIn("a", "b"),
    ).rejects.toMatchObject({ code: "locked" });
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
  it("reads the session, or none", async () => {
    expect(
      await createLiveAuthClient({
        fetchImpl: reply(401, { code: "session_expired" }),
      }).getSession(),
    ).toBeNull();
    const s = { user: { username: "a" }, steps: [] };
    expect(
      await createLiveAuthClient({ fetchImpl: reply(200, s) }).getSession(),
    ).toEqual(s);
  });
  it("lists devices through the BFF", async () => {
    const fetchImpl = reply(200, []);
    expect(await createLiveAuthClient({ fetchImpl }).listDevices()).toEqual([]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/auth/devices");
    expect(init.method).toBe("GET");
  });
  it("regenerates backup codes", async () => {
    const c = createLiveAuthClient({
      fetchImpl: reply(200, { backupCodes: ["A"] }),
    });
    expect(await c.regenerateBackupCodes()).toEqual(["A"]);
  });
  it("accepts empty success replies", async () => {
    const c = createLiveAuthClient({ fetchImpl: reply(202) });
    await expect(c.requestPasswordReset("a@b.c")).resolves.toBeUndefined();
  });
  it("signs out even if the server call fails", async () => {
    const c = createLiveAuthClient({ fetchImpl: reply(503) });
    await expect(c.signOut()).resolves.toBeUndefined();
  });
});
