import { describe, expect, it, vi } from "vitest";
import { callUpstream, UpstreamError } from "./upstream";

describe("callUpstream", () => {
  it("joins base and path and sends the bearer token", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: 1 }));
    expect(
      await callUpstream("http://api.test/api/v1", "/auth/logout", {
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
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
    });
    expect(init.body).toBe('{"a":1}');
  });
  it("a non-ok reply throws UpstreamError with the body's code", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { code: "login_locked", detail: "secret detail" },
        { status: 429 },
      ),
    );
    const e = await callUpstream("http://api.test", "/x", { fetchImpl }).catch(
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(UpstreamError);
    expect(e).toMatchObject({ status: 429, code: "login_locked" });
    expect(JSON.stringify(e)).not.toContain("secret detail");
  });
  it("a timeout throws UpstreamError(503,'unavailable')", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          ),
        ),
    );
    await expect(
      callUpstream("http://api.test", "/slow", {
        timeoutMs: 10,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
});
