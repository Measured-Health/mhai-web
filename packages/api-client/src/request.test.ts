import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { createApiRequest } from "./request";

describe("createApiRequest", () => {
  it("prefix is applied", async () => {
    const { apiOk } = createApiRequest({
      prefix: "/api/platform",
      onUnauthorized: vi.fn(),
    });
    const fetchImpl = vi.fn(async () => Response.json({ ok: 1 }));
    expect(await apiOk(fetchImpl, "/hospitals")).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/platform/hospitals",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });
  it("401 calls onUnauthorized once and throws session_expired", async () => {
    const onUnauthorized = vi.fn();
    const { apiRequest } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized,
    });
    const fetchImpl = vi.fn(async () =>
      Response.json({ code: "unauthorized" }, { status: 401 }),
    );
    const e = await apiRequest(fetchImpl, "/me").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 401, code: "session_expired" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
  it("network failure is ApiError 0 network", async () => {
    const onUnauthorized = vi.fn();
    const { apiOk } = createApiRequest({ prefix: "/api/v1", onUnauthorized });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const e = await apiOk(fetchImpl, "/me").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, code: "network" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
