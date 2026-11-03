import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

import { backendFetch, clientIp } from "./backend";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BACKEND_TRANSPORT", "http");
  vi.stubEnv("BFF_SERVICE_KEY_FILE", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  request.headers = new Headers();
});

const sentIp = async () => {
  await backendFetch("http://api.test/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const init = fetchMock.mock.calls.at(-1)![1] as RequestInit;
  return new Headers(init.headers).get("X-MHAI-Client-IP");
};

describe("the client IP (A6)", () => {
  it("is sent from the trusted header when it is an IP literal", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    request.headers = new Headers({ "x-real-ip": "198.51.100.7" });
    expect(await clientIp()).toBe("198.51.100.7");
    expect(await sentIp()).toBe("198.51.100.7");
    request.headers = new Headers({ "x-real-ip": "2001:db8::1" });
    expect(await sentIp()).toBe("2001:db8::1");
  });
  it("is not sent when the value isn't an IP literal", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    for (const v of ["not-an-ip", "198.51.100.7, 10.0.0.1", "198.51.100.300"]) {
      request.headers = new Headers({ "x-real-ip": v });
      expect(await sentIp()).toBeNull();
    }
  });
  it("is not sent when the setting is unset, whatever the request says", async () => {
    request.headers = new Headers({
      "x-real-ip": "198.51.100.7",
      "x-forwarded-for": "198.51.100.8",
      "x-mhai-client-ip": "198.51.100.9",
    });
    expect(await sentIp()).toBeNull();
  });
  it("reads only the named header, never X-Forwarded-For", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    request.headers = new Headers({ "x-forwarded-for": "198.51.100.8" });
    expect(await sentIp()).toBeNull();
  });
});

describe("apiBase", () => {
  it("on NATS is the NATS origin and needs no MHAI_API_URL", async () => {
    const { apiBase } = await import("./http");
    vi.stubEnv("BACKEND_TRANSPORT", "nats");
    vi.stubEnv("MHAI_API_URL", "");
    expect(apiBase()).toBe("http://core.nats.invalid/api/v1");
    vi.stubEnv("BACKEND_TRANSPORT", "http");
    vi.stubEnv("MHAI_API_URL", "http://api.test/");
    expect(apiBase()).toBe("http://api.test/api/v1");
  });
});
