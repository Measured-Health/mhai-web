import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiBase, UpstreamError } from "./api";

beforeEach(() => {
  vi.stubEnv("MHAI_API_URL", "http://api.test/");
  vi.stubEnv("BACKEND_TRANSPORT", "http");
});
afterEach(() => vi.unstubAllEnvs());

describe("api", () => {
  it("calls /api/v1 with the bearer token and JSON body", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: 1 }));
    expect(
      await api("/auth/logout", {
        method: "POST",
        token: "t",
        body: { a: 1 },
        fetchImpl,
      }),
    ).toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/api/v1/auth/logout");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"a":1}');
    expect(init.cache).toBe("no-store");
  });
  it("keeps only the problem code, never the detail", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { code: "login_locked", detail: "secret detail", status: 429 },
        { status: 429 },
      ),
    );
    const e = (await api("/auth/login", { fetchImpl }).catch(
      (x) => x,
    )) as UpstreamError;
    expect(e).toBeInstanceOf(UpstreamError);
    expect(e).toMatchObject({ status: 429, code: "login_locked" });
    expect(JSON.stringify(e)).not.toContain("secret detail");
  });
  it("turns network failures and timeouts into unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(api("/x", { fetchImpl })).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    });
  });
  it("returns nothing for 204", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await api("/x", { fetchImpl })).toBeUndefined();
  });
  it("on NATS, the base is the NATS origin and needs no MHAI_API_URL", async () => {
    vi.stubEnv("BACKEND_TRANSPORT", "nats");
    vi.stubEnv("MHAI_API_URL", "");
    expect(apiBase()).toBe("http://core.nats.invalid/api/v1");
    const fetchImpl = vi.fn(async () => Response.json({ ok: 1 }));
    await api("/auth/logout", { fetchImpl });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://core.nats.invalid/api/v1/auth/logout",
    );
  });
  it("throws loudly when the API address isn't set", async () => {
    vi.stubEnv("MHAI_API_URL", "");
    await expect(api("/x", { fetchImpl: vi.fn() })).rejects.toThrow(
      /MHAI_API_URL/,
    );
  });
});
