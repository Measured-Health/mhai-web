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
    expect(refreshWithinMs({ SESSION_REFRESH_WITHIN_S: "1200" })).toBe(
      1_200_000,
    );
  });
  it("ignores anything but a whole number of seconds from 1 to 3600", () => {
    for (const v of ["0", "-5", "abc", "1.5", "3601", ""])
      expect(refreshWithinMs({ SESSION_REFRESH_WITHIN_S: v })).toBe(300_000);
  });
});
