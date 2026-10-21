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

describe("refreshOnce", () => {
  it("refreshes once per old token, with the platform audience", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ access_token: "new", expires_in: 600 }),
    );
    const [a, b] = await Promise.all([refreshOnce("old"), refreshOnce("old")]);
    expect(a?.token).toBe("new");
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/refresh");
    const h = new Headers(init.headers);
    expect(h.get("X-MHAI-Audience")).toBe("platform");
    expect(h.get("Authorization")).toBe("Bearer old");
  });

  it("gives null on a failure or a malformed reply, and retries next time", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "unauthenticated" }, { status: 401 }),
    );
    expect(await refreshOnce("old")).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json({ access_token: "x" }));
    expect(await refreshOnce("old")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
