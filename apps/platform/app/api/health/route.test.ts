import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setNatsRequesterForTests,
  type NatsRequester,
} from "@mhai/api-client/server/nats/connection";
import { GET } from "./route";

const requester = (up: boolean): NatsRequester => ({
  ready: () => up,
  request: () => Promise.reject(new Error("unused")),
});

afterEach(() => {
  vi.unstubAllEnvs();
  __setNatsRequesterForTests("platform", null);
});

describe("GET /api/health", () => {
  it("is ok on http", async () => {
    vi.stubEnv("BACKEND_TRANSPORT", "http");
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("follows the NATS connection on nats", async () => {
    vi.stubEnv("BACKEND_TRANSPORT", "nats");
    __setNatsRequesterForTests("platform", requester(true));
    expect(GET().status).toBe(200);
    __setNatsRequesterForTests("platform", requester(false));
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable" });
  });
  it("an unknown transport is unavailable", () => {
    vi.stubEnv("BACKEND_TRANSPORT", "grpc");
    expect(GET().status).toBe(503);
  });
});
