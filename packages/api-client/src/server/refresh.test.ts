// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRefresher, refreshWithinMs } from "./refresh";
import { UpstreamError } from "./upstream";

const ok = (n: number) => ({
  access_token: `a${n}`,
  refresh_token: `r${n}`,
  expires_in: 900,
});

describe("createRefresher (core's POST /auth/refresh {refresh_token})", () => {
  it("sends the refresh token in the body and returns the rotated pair", async () => {
    const call = vi.fn(async () => ok(2));
    const r = createRefresher(call, () => 1_000);
    expect(await r.refreshOnce("r1")).toEqual({
      token: "a2",
      refreshToken: "r2",
      expiresAt: 1_000 + 900_000,
    });
    expect(call).toHaveBeenCalledWith({ refresh_token: "r1" });
  });

  it("concurrent refreshes of one token share one call", async () => {
    let release!: (v: unknown) => void;
    const call = vi.fn(() => new Promise((res) => (release = res)));
    const r = createRefresher(call);
    const a = r.refreshOnce("r1");
    const b = r.refreshOnce("r1");
    release(ok(2));
    expect(await a).toEqual(await b);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("a request still carrying the old token gets the newer pair, not a second rotation", async () => {
    const call = vi.fn(async () => ok(2));
    const r = createRefresher(call);
    await r.refreshOnce("r1");
    expect((await r.refreshOnce("r1"))?.refreshToken).toBe("r2");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("a request still carrying the rotated-out token 15 s later gets the same pair, with no second call to core", async () => {
    vi.useFakeTimers();
    try {
      const call = vi.fn(async () => ok(2));
      const r = createRefresher(call);
      const first = await r.refreshOnce("r1");
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await r.refreshOnce("r1")).toEqual(first);
      expect(call).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(40_000);
      expect(await r.refreshOnce("r1")).toEqual(first);
      expect(call).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("successor() follows the rotations a refresh token has had", async () => {
    let n = 1;
    const call = vi.fn(async () => ok(++n));
    const r = createRefresher(call);
    expect(r.successor("r1")).toBeNull();
    await r.refreshOnce("r1"); // r1 -> r2
    await r.refreshOnce("r2"); // r2 -> r3
    expect(r.successor("r1")?.refreshToken).toBe("r3");
    expect(r.successor("r2")?.refreshToken).toBe("r3");
    expect(r.successor("r3")).toBeNull();
  });

  it("past the minute, a stale token goes to core unchanged (its reuse check runs)", async () => {
    vi.useFakeTimers();
    try {
      const call = vi.fn(async () => ok(2));
      const r = createRefresher(call);
      await r.refreshOnce("r1");
      await vi.advanceTimersByTimeAsync(61_000);
      expect(r.successor("r1")).toBeNull();
      await r.refreshOnce("r1");
      expect(call).toHaveBeenCalledTimes(2);
      expect(call).toHaveBeenLastCalledWith({ refresh_token: "r1" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("forget() drops a session's whole chain: a stale cookie can't resolve after sign-out", async () => {
    let n = 1;
    const call = vi.fn(async () => ok(++n));
    const r = createRefresher(call);
    await r.refreshOnce("r1"); // r1 -> r2
    await r.refreshOnce("r2"); // r2 -> r3
    r.forget("r3"); // the current one, as sign-out holds it
    expect(r.successor("r1")).toBeNull();
    expect(r.successor("r2")).toBeNull();
    await r.refreshOnce("r1");
    expect(call).toHaveBeenLastCalledWith({ refresh_token: "r1" });
  });

  it("a refresh still in flight at sign-out never brings its successor back", async () => {
    let release!: (v: unknown) => void;
    const call = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => (release = res)))
      .mockResolvedValue(ok(9));
    const r = createRefresher(call);
    const pending = r.refreshOnce("r1");
    r.forget("r1"); // sign-out while the refresh is still running
    release(ok(2));
    await pending;
    expect(r.successor("r1")).toBeNull();
    expect(r.successor("r2")).toBeNull();
    // A stale cookie's token goes to core (which refuses it).
    await r.refreshOnce("r1");
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenLastCalledWith({ refresh_token: "r1" });
  });

  it("every waiter on a refresh in flight at sign-out gets null, never the new pair", async () => {
    let release!: (v: unknown) => void;
    const call = vi.fn(() => new Promise((res) => (release = res)));
    const r = createRefresher(call);
    const a = r.refreshOnce("r1");
    const b = r.refreshOnce("r1");
    r.forget("r1");
    release(ok(2));
    expect(await a).toBeNull();
    expect(await b).toBeNull();
    expect(r.isForgotten("r1")).toBe(true);
    expect(r.isForgotten("r2")).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("a refresh that ends the session (401) forgets its chain", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(ok(2))
      .mockRejectedValueOnce(new UpstreamError(401, "unauthenticated"));
    const r = createRefresher(call);
    await r.refreshOnce("r1"); // r1 -> r2
    expect(await r.refreshOnce("r2")).toBeNull();
    expect(r.successor("r1")).toBeNull();
  });

  it("a loop or an over-long chain fails closed: no successor (the token goes to core)", async () => {
    const r = createRefresher(
      vi
        .fn()
        .mockResolvedValueOnce({
          access_token: "a",
          refresh_token: "r2",
          expires_in: 900,
        })
        .mockResolvedValueOnce({
          access_token: "b",
          refresh_token: "r1",
          expires_in: 900,
        }),
    );
    await r.refreshOnce("r1"); // r1 -> r2
    await r.refreshOnce("r2"); // r2 -> r1: a loop
    expect(r.successor("r1")).toBeNull();
    expect(r.successor("r2")).toBeNull();

    let n = 0;
    const long = createRefresher(vi.fn(async () => ok(++n + 100)));
    let t = "s0";
    for (let i = 0; i < 12; i++) t = (await long.refreshOnce(t))!.refreshToken;
    expect(long.successor("s0")).toBeNull();
  });

  it("409 conflict (rotated elsewhere within 10 s): keep the newer token known here, else nothing", async () => {
    const call = vi.fn(async () => {
      throw new UpstreamError(409, "conflict");
    });
    const r = createRefresher(call);
    expect(await r.refreshOnce("r1")).toBeNull();
    // Not cached: a later call may try again.
    await r.refreshOnce("r1");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("401, a network error or a malformed reply is null (keep the current token)", async () => {
    for (const reply of [
      () => Promise.reject(new UpstreamError(401, "unauthenticated")),
      () => Promise.reject(new UpstreamError(503, "unavailable")),
      () => Promise.resolve({ access_token: "a2", expires_in: 900 }),
      () =>
        Promise.resolve({
          access_token: "",
          refresh_token: "r2",
          expires_in: 900,
        }),
      () =>
        Promise.resolve({
          access_token: "a2",
          refresh_token: "r2",
          expires_in: -1,
        }),
      () => Promise.resolve(null),
    ]) {
      const r = createRefresher(vi.fn(reply));
      expect(await r.refreshOnce("r1")).toBeNull();
    }
  });

  it("refuses an empty refresh token without calling core", async () => {
    const call = vi.fn(async () => ok(2));
    const r = createRefresher(call);
    expect(await r.refreshOnce("")).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe("refreshWithinMs", () => {
  it("is 5 minutes by default and reads SESSION_REFRESH_WITHIN_S", () => {
    expect(refreshWithinMs({})).toBe(300_000);
    expect(refreshWithinMs({ SESSION_REFRESH_WITHIN_S: "540" })).toBe(540_000);
  });
  it("stays below the token's life (600 s at most) except in development", () => {
    expect(refreshWithinMs({ SESSION_REFRESH_WITHIN_S: "1200" })).toBe(300_000);
    expect(
      refreshWithinMs({
        SESSION_REFRESH_WITHIN_S: "1200",
        MHAI_DEPLOY_ENV: "development",
      }),
    ).toBe(1_200_000);
  });
  it("ignores anything but a whole number of seconds in range", () => {
    for (const v of ["0", "-5", "abc", "1.5", "3601", "601", ""])
      expect(refreshWithinMs({ SESSION_REFRESH_WITHIN_S: v })).toBe(300_000);
  });
});
