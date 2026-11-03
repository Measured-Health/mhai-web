// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRefreshCacheForTests, refreshOnce } from "./refresh";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("MHAI_API_URL", "http://api.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  __resetRefreshCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const rotated = () =>
  Response.json({ access_token: "new", refresh_token: "r2", expires_in: 600 });

describe("refreshOnce (core: POST /auth/refresh {refresh_token})", () => {
  it("refreshes once per refresh token, in the body, with the platform audience and no bearer", async () => {
    fetchMock.mockResolvedValue(rotated());
    const [a, b] = await Promise.all([refreshOnce("r1"), refreshOnce("r1")]);
    expect(a).toMatchObject({ token: "new", refreshToken: "r2" });
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/refresh");
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "r1" });
    const h = new Headers(init.headers);
    expect(h.get("X-MHAI-Audience")).toBe("platform");
    expect(h.get("Authorization")).toBeNull();
  });

  it("gives null on a failure, a 409 or a malformed reply, and retries next time", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "unauthenticated" }, { status: 401 }),
    );
    expect(await refreshOnce("r1")).toBeNull();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "conflict" }, { status: 409 }),
    );
    expect(await refreshOnce("r1")).toBeNull();
    fetchMock.mockResolvedValueOnce(
      Response.json({ access_token: "x", expires_in: 600 }),
    );
    expect(await refreshOnce("r1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
