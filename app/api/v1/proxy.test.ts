import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: (n: string) =>
      values.has(n) ? { name: n, value: values.get(n)! } : undefined,
    set: (n: string, v: string) => void values.set(n, v),
    delete: (n: string) => void values.delete(n),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import {
  SESSION_COOKIE,
  readSession,
  writeSession,
} from "@/lib/server/session";
import { __resetRefreshCacheForTests } from "@/lib/server/refresh";
import { TEST_USER } from "@/tests/auth-wrapper";
import { GET, POST } from "./[...path]/route";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  vi.stubEnv("MHAI_API_URL", "http://api.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  jar.values.clear();
  __resetRefreshCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const get = (url = "http://demo.test/api/v1/queries/q1") =>
  new Request(url, { headers: { host: "demo.test", cookie: "other=1" } });
const post = (
  body: string,
  origin = "http://demo.test",
  extra: Record<string, string> = {},
) =>
  new Request("http://demo.test/api/v1/queries", {
    method: "POST",
    headers: {
      host: "demo.test",
      origin,
      "content-type": "application/json",
      ...extra,
    },
    body,
  });
const session = (expiresInMs = 10 * 60_000) =>
  writeSession({
    token: "tok",
    expiresAt: Date.now() + expiresInMs,
    user: TEST_USER,
    steps: [],
  });

describe("clinical API proxy", () => {
  it("forwards with the bearer token only, and never caches", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({ status: "processing" }));
    const res = await GET(
      get("http://demo.test/api/v1/queries/q1?x=1"),
      ctx("queries", "q1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/queries/q1?x=1");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer tok",
    });
  });

  it("posts the body through", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ query_id: "q2" }, { status: 202 }),
    );
    const res = await POST(post('{"a":1}'), ctx("queries"));
    expect(res.status).toBe(202);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].body).toBe(
      '{"a":1}',
    );
  });

  it("forwards a valid Idempotency-Key and drops a bad one", async () => {
    await session();
    fetchMock.mockResolvedValue(Response.json({}, { status: 202 }));
    await POST(
      post("{}", "http://demo.test", { "Idempotency-Key": "k-1" }),
      ctx("queries"),
    );
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({ "Idempotency-Key": "k-1" });
    await POST(
      post("{}", "http://demo.test", { "Idempotency-Key": "bad key!" }),
      ctx("queries"),
    );
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    ).not.toHaveProperty("Idempotency-Key");
  });

  it.each([
    [["admin", "users"]],
    [["queries", "..", "admin", "users"]],
    [["queries", ""]],
    [["auth", "login"]],
    [["queries", "../admin/users"]],
    [["queries", "a\\b"]],
    [["queries", "%2e"]],
  ])("refuses %j", async (path) => {
    await session();
    const res = await GET(get(), ctx(...path));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the session ended when there isn't one", async () => {
    const res = await GET(get(), ctx("queries", "q1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
  });

  it("clears the session when the API rejects the token", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "token_expired" }, { status: 401 }),
    );
    const res = await GET(get(), ctx("queries", "q1"));
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(jar.values.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("refreshes a token close to expiry", async () => {
    await session(60_000);
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ access_token: "tok2", expires_in: 900 }),
      )
      .mockResolvedValueOnce(Response.json({}));
    await GET(get(), ctx("queries", "q1"));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/auth/refresh",
    );
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    ).toMatchObject({
      Authorization: "Bearer tok2",
    });
    expect((await readSession())?.token).toBe("tok2");
  });

  it("guards writes and their size", async () => {
    await session();
    expect(
      (await POST(post("{}", "https://evil.test"), ctx("queries"))).status,
    ).toBe(403);
    expect(
      (await POST(post("x".repeat(64 * 1024 + 1)), ctx("queries"))).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the API being down", async () => {
    await session();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await GET(get(), ctx("queries", "q1"));
    expect(res.status).toBe(503);
  });

  it("forwards a normal nested path", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res = await GET(get(), ctx("queries", "q-1", "result"));
    expect(res.status).toBe(200);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/queries/q-1/result",
    );
  });

  it("never echoes upstream error text", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "validation_failed", detail: "secret detail" },
        { status: 422 },
      ),
    );
    const res = await GET(get(), ctx("queries", "q1"));
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code: "validation_failed" });
    expect(text).not.toContain("secret detail");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    fetchMock.mockResolvedValueOnce(
      new Response("<html>boom</html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
    );
    const bad = await GET(get(), ctx("queries", "q1"));
    expect(bad.status).toBe(500);
    expect(await bad.json()).toEqual({ code: "error" });
  });

  it("keeps the old token when the refresh fails", async () => {
    await session(60_000);
    const before = jar.values.get(SESSION_COOKIE);
    fetchMock
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json({}));
    await GET(get(), ctx("queries", "q1"));
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    ).toMatchObject({ Authorization: "Bearer tok" });
    expect(jar.values.get(SESSION_COOKIE)).toBe(before);
  });

  it("ignores a malformed refresh reply", async () => {
    await session(60_000);
    const before = jar.values.get(SESSION_COOKIE);
    fetchMock
      .mockResolvedValueOnce(Response.json({ access_token: "t2" }))
      .mockResolvedValueOnce(Response.json({}));
    await GET(get(), ctx("queries", "q1"));
    expect(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    ).toMatchObject({ Authorization: "Bearer tok" });
    expect(jar.values.get(SESSION_COOKIE)).toBe(before);
  });

  it("refreshes once for concurrent requests", async () => {
    await session(60_000);
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? Response.json({ access_token: "t2", expires_in: 900 })
        : Response.json({}),
    );
    await Promise.all([
      GET(get(), ctx("queries", "q1")),
      GET(get(), ctx("queries", "q2")),
    ]);
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.filter(([u]) => u.endsWith("/auth/refresh"))).toHaveLength(1);
    const fwd = calls.filter(([u]) => !u.endsWith("/auth/refresh"));
    expect(fwd).toHaveLength(2);
    for (const [, init] of fwd)
      expect(init.headers).toMatchObject({ Authorization: "Bearer t2" });
  });
});
