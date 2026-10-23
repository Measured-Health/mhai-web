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
import type { Role, User } from "@/lib/auth/types";
import { TEST_USER } from "@/tests/auth-wrapper";
import { DELETE, GET, PATCH, POST } from "./[...path]/route";

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

  it("refuses anyone but a clinician, without calling the API", async () => {
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles: ["admin"] },
      steps: [],
    });
    for (const res of [
      await GET(get(), ctx("queries", "q1")),
      await POST(post("{}"), ctx("queries")),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a clinician who hasn't finished first sign-in", async () => {
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: TEST_USER,
      steps: ["terms"],
    });
    const res = await GET(get(), ctx("queries", "q1"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
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

describe("corrections and feedback routes", () => {
  it.each([
    ["GET", ["corrections"]],
    ["GET", ["corrections", "mine"]],
    ["GET", ["corrections", "reviewed"]],
    ["GET", ["feedback", "stats", "mine"]],
    ["POST", ["corrections", "c-1", "approve"]],
    ["POST", ["corrections", "c-1", "reject"]],
    ["POST", ["corrections", "c-1", "withdraw"]],
    ["POST", ["feedback"]],
  ])("forwards %s %j", async (method, path) => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res =
      method === "GET"
        ? await GET(get(), ctx(...path))
        : await POST(post("{}"), ctx(...path));
    expect(res.status).toBe(200);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://api.test/api/v1/${path.join("/")}`,
    );
  });

  it.each([
    ["GET", ["corrections", "c-1"]],
    ["GET", ["corrections", "c-1", "approve"]],
    ["POST", ["corrections"]],
    ["POST", ["corrections", "c-1"]],
    ["POST", ["corrections", "c-1", "delete"]],
    ["POST", ["corrections", "c-1", "approve", "x"]],
    ["GET", ["feedback"]],
    ["GET", ["feedback", "stats", "all"]],
    ["POST", ["feedback", "stats", "mine"]],
    ["POST", ["corrections", "c.1", "approve"]],
  ])("refuses %s %j without calling the API", async (method, path) => {
    await session();
    const res =
      method === "GET"
        ? await GET(get(), ctx(...path))
        : await POST(post("{}"), ctx(...path));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the waiting filter through", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await GET(
      get("http://demo.test/api/v1/corrections?status=pending"),
      ctx("corrections"),
    );
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/corrections?status=pending",
    );
  });

  it("forwards a decision's idempotency key and keeps only the refusal code", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "self_approval", detail: "user 42 submitted it" },
        { status: 403 },
      ),
    );
    const res = await POST(
      post("{}", "http://demo.test", { "Idempotency-Key": "k-9" }),
      ctx("corrections", "c-1", "approve"),
    );
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({ "Idempotency-Key": "k-9" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "self_approval" });
  });

  it("refuses a decision from another site", async () => {
    await session();
    const res = await POST(
      post("{}", "https://evil.test"),
      ctx("corrections", "c-1", "approve"),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hospital admin routes", () => {
  const as = (roles: Role[], mfaEnabled = true) =>
    writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles, mfaEnabled },
      steps: [],
    });
  const send = (
    method: string,
    body?: string,
    origin = "http://demo.test",
    extra: Record<string, string> = {},
  ) =>
    new Request("http://demo.test/api/v1/hospital", {
      method,
      headers: {
        host: "demo.test",
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body,
    });
  const CODE = JSON.stringify({ mfa_code: "123456" });
  const run = (method: string, path: string[]) => {
    const c = ctx("hospital", ...path);
    if (method === "GET") return GET(get(), c);
    if (method === "POST") return POST(send("POST", "{}"), c);
    if (method === "PATCH") return PATCH(send("PATCH", "{}"), c);
    return DELETE(send("DELETE", CODE), c);
  };

  it.each([
    ["GET", ["staff"]],
    ["GET", ["settings"]],
    ["GET", ["usage"]],
    ["GET", ["activity"]],
    ["GET", ["review-oversight"]],
    ["GET", ["corrections", "c-1", "eligible-reviewers"]],
    ["POST", ["staff", "invites"]],
    ["POST", ["staff", "s-1", "deactivate"]],
    ["POST", ["staff", "s-1", "reactivate"]],
    ["POST", ["staff", "s-1", "password-reset"]],
    ["POST", ["staff", "s-1", "reset-mfa"]],
    ["POST", ["staff", "s-1", "remind"]],
    ["POST", ["staff", "s-1", "resend-invite"]],
    ["POST", ["corrections", "c-1", "remind"]],
    ["POST", ["corrections", "c-1", "assign"]],
    ["PATCH", ["staff", "s-1"]],
    ["PATCH", ["settings"]],
    ["DELETE", ["staff", "s-1"]],
  ])("forwards %s %j for a hospital admin", async (method, path) => {
    await as(["hospital_admin"]);
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res = await run(method, path);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/v1/hospital/${path.join("/")}`);
    expect(init.method).toBe(method);
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it.each([
    ["GET", []],
    ["GET", ["staff", "s-1"]],
    ["GET", ["staff", "invites"]],
    ["POST", ["staff"]],
    ["POST", ["staff", "s-1"]],
    ["POST", ["staff", "s-1", "delete"]],
    ["POST", ["staff", "invites", "deactivate"]],
    ["PATCH", ["staff"]],
    ["PATCH", ["staff", "invites"]],
    ["PATCH", ["staff", "s-1", "deactivate"]],
    ["DELETE", ["staff"]],
    ["DELETE", ["staff", "invites"]],
    ["DELETE", ["staff", "s-1", "deactivate"]],
    ["DELETE", ["settings"]],
    ["DELETE", ["corrections", "c-1", "assign"]],
    ["POST", ["settings"]],
    ["GET", ["settings", "x"]],
    ["PATCH", ["usage"]],
    ["POST", ["activity"]],
    ["GET", ["usage", "x"]],
    ["GET", ["corrections"]],
    ["GET", ["corrections", "c-1"]],
    ["GET", ["corrections", "c-1", "assign"]],
    ["POST", ["corrections", "c-1", "eligible-reviewers"]],
    ["POST", ["corrections", "c-1", "approve"]],
    ["POST", ["staff", "s-1", "deactivate", "x"]],
    ["GET", ["users"]],
    ["POST", ["staff", "s.1", "deactivate"]],
    ["PATCH", ["staff", ".."]],
    ["DELETE", ["staff", "s%2F1"]],
    ["DELETE", ["staff", "s/1"]],
    ["DELETE", ["staff", ""]],
    ["GET", ["staff", "..", "..", "users"]],
  ])("refuses %s %j without calling the API", async (method, path) => {
    await as(["hospital_admin"]);
    const res = await run(method, path);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses PATCH and DELETE on clinical routes", async () => {
    await session();
    for (const res of [
      await PATCH(send("PATCH", "{}"), ctx("queries", "q1")),
      await PATCH(send("PATCH", "{}"), ctx("feedback")),
      await DELETE(send("DELETE"), ctx("queries", "q1")),
      await DELETE(send("DELETE"), ctx("corrections", "c-1", "approve")),
    ])
      expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never lets HEAD or another method into a write", async () => {
    await as(["clinician", "hospital_admin"]);
    const head = (path: string[]) =>
      GET(
        new Request("http://demo.test/api/v1/x", {
          method: "HEAD",
          headers: { host: "demo.test", origin: "http://demo.test" },
        }),
        ctx(...path),
      );
    for (const res of [
      await head(["corrections", "c-1", "approve"]),
      await head(["feedback"]),
      await head(["queries"]),
      await head(["hospital", "staff", "s-1"]),
      await head(["hospital", "staff", "s-1", "deactivate"]),
      await head(["hospital", "staff"]),
      await POST(send("PUT", "{}"), ctx("hospital", "staff", "s-1")),
      await POST(send("PUT", "{}"), ctx("queries")),
    ])
      expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses clinical calls for an admin-only session, without calling the API", async () => {
    await as(["hospital_admin"]);
    for (const res of [
      await GET(get(), ctx("queries", "q1")),
      await GET(get(), ctx("corrections")),
      await GET(get(), ctx("readyz")),
      await POST(post("{}"), ctx("feedback")),
      await POST(post("{}"), ctx("corrections", "c-1", "approve")),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses hospital calls for a clinician or a platform account", async () => {
    for (const roles of [
      ["clinician"],
      ["admin"],
      ["auditor"],
      ["auditor", "hospital_admin"],
      ["admin", "clinician", "hospital_admin"],
      [],
    ] as Role[][]) {
      await as(roles);
      for (const res of [
        await GET(get(), ctx("hospital", "staff")),
        await DELETE(send("DELETE", CODE), ctx("hospital", "staff", "s-1")),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "forbidden" });
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses admin calls for an admin without two-step, without calling the API", async () => {
    for (const roles of [
      ["hospital_admin"],
      ["clinician", "hospital_admin"],
    ] as Role[][]) {
      await as(roles, false);
      for (const res of [
        await GET(get(), ctx("hospital", "staff")),
        await PATCH(send("PATCH", "{}"), ctx("hospital", "settings")),
        await DELETE(send("DELETE", CODE), ctx("hospital", "staff", "s-1")),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "mfa_required" });
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a clinician without two-step as forbidden, not as needing two-step", async () => {
    await as(["clinician"], false);
    for (const res of [
      await GET(get(), ctx("hospital", "staff")),
      await DELETE(send("DELETE", CODE), ctx("hospital", "staff", "s-1")),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a query string only on reads", async () => {
    await as(["hospital_admin"]);
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    const write = (method: string, body: string) =>
      new Request("http://demo.test/api/v1/hospital/staff/s-1?x=1&y=2", {
        method,
        headers: {
          host: "demo.test",
          origin: "http://demo.test",
          "content-type": "application/json",
        },
        body,
      });
    await DELETE(write("DELETE", CODE), ctx("hospital", "staff", "s-1"));
    await PATCH(write("PATCH", "{}"), ctx("hospital", "staff", "s-1"));
    await POST(
      write("POST", "{}"),
      ctx("hospital", "staff", "s-1", "deactivate"),
    );
    for (const [url] of fetchMock.mock.calls as [string][])
      expect(url).not.toContain("?");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refuses a platform account the same way whether or not two-step is on", async () => {
    await as(["admin", "hospital_admin"], false);
    const res = await GET(get(), ctx("hospital", "staff"));
    expect(await res.json()).toEqual({ code: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a medical director use both sides", async () => {
    await as(["clinician", "hospital_admin"]);
    fetchMock.mockImplementation(async () => Response.json({}));
    expect((await GET(get(), ctx("hospital", "staff"))).status).toBe(200);
    expect((await GET(get(), ctx("queries", "q1"))).status).toBe(200);
  });

  it("keeps clinical calls for a clinician without two-step", async () => {
    await as(["clinician"], false);
    fetchMock.mockImplementation(async () => Response.json({}));
    expect((await GET(get(), ctx("queries", "q1"))).status).toBe(200);
  });

  it("refuses an admin who owes first sign-in steps", async () => {
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles: ["hospital_admin"] },
      steps: ["mfa"],
    });
    expect((await GET(get(), ctx("hospital", "staff"))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the session ended when there isn't one", async () => {
    const res = await DELETE(
      send("DELETE", CODE),
      ctx("hospital", "staff", "s-1"),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guards writes from other sites", async () => {
    await as(["hospital_admin"]);
    for (const res of [
      await DELETE(
        send("DELETE", CODE, "https://evil.test"),
        ctx("hospital", "staff", "s-1"),
      ),
      await PATCH(
        send("PATCH", "{}", "https://evil.test"),
        ctx("hospital", "settings"),
      ),
      await POST(
        send("POST", "{}", "https://evil.test"),
        ctx("hospital", "staff", "invites"),
      ),
      await PATCH(
        new Request("http://demo.test/api/v1/hospital", {
          method: "PATCH",
          headers: { host: "demo.test" },
          body: "{}",
        }),
        ctx("hospital", "settings"),
      ),
    ])
      expect(res.status).toBe(403);
    expect(
      (
        await PATCH(
          send("PATCH", "x".repeat(64 * 1024 + 1)),
          ctx("hospital", "settings"),
        )
      ).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the remove code body and the key, and passes the filters through", async () => {
    await as(["hospital_admin"]);
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    const res = await DELETE(
      send("DELETE", JSON.stringify({ backup_code: "ABCD-1234" }), undefined, {
        "Idempotency-Key": "k-7",
      }),
      ctx("hospital", "staff", "s-1"),
    );
    expect(res.status).toBe(204);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ backup_code: "ABCD-1234" }));
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "Idempotency-Key": "k-7",
    });
    fetchMock.mockImplementation(async () => Response.json({ events: [] }));
    await GET(
      get(
        "http://demo.test/api/v1/hospital/activity?type=security&flagged=true",
      ),
      ctx("hospital", "activity"),
    );
    const [url, getInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      "http://api.test/api/v1/hospital/activity?type=security&flagged=true",
    );
    expect(getInit.body).toBeUndefined();
  });

  it.each([
    [403, "mfa_required"],
    [403, "mfa_invalid"],
    [429, "mfa_locked"],
    [409, "last_admin"],
    [403, "self_change"],
  ])("keeps only the refusal code: %i %s", async (status, code) => {
    await as(["hospital_admin"]);
    fetchMock.mockImplementation(async () =>
      Response.json(
        { code, detail: "user 7 is the only admin", attempts: 2 },
        { status },
      ),
    );
    const res = await run("DELETE", ["staff", "s-1"]);
    expect(res.status).toBe(status);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ code });
    expect(text).not.toContain("user 7");
  });
});

describe("patient alert and notification settings routes", () => {
  const as = (roles: Role[]) =>
    writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles },
      steps: [],
    });
  const write = (
    method: string,
    body?: string,
    origin = "http://demo.test",
    extra: Record<string, string> = {},
  ) =>
    new Request("http://demo.test/api/v1/alerts?x=1", {
      method,
      headers: {
        host: "demo.test",
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body,
    });
  const handlers = { GET, POST, PATCH, DELETE } as const;
  const send = (method: string, path: string[]) =>
    handlers[method as keyof typeof handlers](
      method === "GET"
        ? get()
        : write(method, method === "DELETE" ? undefined : "{}"),
      ctx(...path),
    );

  it.each([
    ["GET", ["alerts"]],
    ["GET", ["alerts", "unread-count"]],
    ["GET", ["me", "notification-settings"]],
    ["POST", ["alerts", "al-1", "acknowledge"]],
    ["POST", ["alerts", "al-1", "dismiss"]],
    ["PATCH", ["me", "notification-settings"]],
  ])("forwards %s %j for a clinician", async (method, path) => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res = await send(method, path);
    expect(res.status).toBe(200);
    // Writes never forward a query string.
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://api.test/api/v1/${path.join("/")}`,
    );
  });

  it.each([
    ["GET", ["alerts", "al-1"]],
    ["GET", ["alerts", "al-1", "acknowledge"]],
    ["POST", ["alerts"]],
    ["POST", ["alerts", "al-1"]],
    ["POST", ["alerts", "al-1", "delete"]],
    ["POST", ["alerts", "unread-count", "acknowledge"]],
    ["POST", ["alerts", "al-1", "dismiss", "x"]],
    ["POST", ["alerts", "al.1", "acknowledge"]],
    ["PATCH", ["alerts", "al-1"]],
    ["DELETE", ["alerts", "al-1"]],
    ["GET", ["me"]],
    ["GET", ["me", "profile"]],
    ["POST", ["me", "notification-settings"]],
    ["DELETE", ["me", "notification-settings"]],
  ])("refuses %s %j without calling the API", async (method, path) => {
    await session();
    const res = await send(method, path);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an admin-only or platform session, without calling the API", async () => {
    for (const roles of [
      ["hospital_admin"],
      ["admin"],
      ["auditor"],
    ] as Role[][]) {
      await as(roles);
      for (const [method, path] of [
        ["GET", ["alerts"]],
        ["GET", ["alerts", "unread-count"]],
        ["POST", ["alerts", "al-1", "acknowledge"]],
        ["PATCH", ["me", "notification-settings"]],
      ] as [string, string[]][])
        expect((await send(method, path)).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a medical director use them", async () => {
    await as(["clinician", "hospital_admin"]);
    fetchMock.mockResolvedValueOnce(Response.json({ count: 2 }));
    expect((await send("GET", ["alerts", "unread-count"])).status).toBe(200);
  });

  it("refuses a clinician who still owes first sign-in steps, without calling the API", async () => {
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: TEST_USER,
      steps: ["terms"],
    });
    for (const [method, path] of [
      ["GET", ["alerts"]],
      ["GET", ["me", "notification-settings"]],
      ["POST", ["alerts", "al-1", "dismiss"]],
      ["PATCH", ["me", "notification-settings"]],
    ] as [string, string[]][])
      expect((await send(method, path)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes an alert's body through untouched, record link included", async () => {
    await session();
    const page = {
      alerts: [{ id: "al-1", emr_link: "https://record.example/p/1" }],
      next_cursor: null,
      sources: [],
    };
    fetchMock.mockResolvedValueOnce(Response.json(page));
    const res = await send("GET", ["alerts"]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual(page);
  });

  it("guards the writes from other sites and forwards the idempotency key", async () => {
    await session();
    expect(
      (
        await POST(
          write("POST", "{}", "http://evil.test"),
          ctx("alerts", "al-1", "acknowledge"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await PATCH(
          write("PATCH", "{}", "http://evil.test"),
          ctx("me", "notification-settings"),
        )
      ).status,
    ).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await POST(
      write("POST", "{}", "http://demo.test", { "idempotency-key": "k-1" }),
      ctx("alerts", "al-1", "acknowledge"),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/alerts/al-1/acknowledge");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "k-1",
    );
  });

  it("passes the list filters through", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ alerts: [], next_cursor: null, sources: [] }),
    );
    await GET(
      get(
        "http://demo.test/api/v1/alerts?status=new&severity=critical&cursor=20",
      ),
      ctx("alerts"),
    );
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/alerts?status=new&severity=critical&cursor=20",
    );
  });

  it("keeps only who and when from a 409 already_handled (Review Focus 1)", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          code: "already_handled",
          status: "dismissed",
          handled_by: {
            display_name: "Nurse Bello",
            id: "u-9",
            email: "nurse.bello@hospital.example",
          },
          handled_at: "2026-10-17T08:59:00.000Z",
          patient: { full_name: "Someone Else" },
          detail: "upstream text",
        },
        { status: 409 },
      ),
    );
    const res = await POST(
      write("POST", "{}"),
      ctx("alerts", "al-1", "dismiss"),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: "already_handled",
      status: "dismissed",
      handled_by: { display_name: "Nurse Bello" },
      handled_at: "2026-10-17T08:59:00.000Z",
    });
  });

  it("drops a malformed who-and-when, and keeps only the code for any other 409", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          code: "already_handled",
          status: "weird",
          handled_by: { display_name: 42 },
          handled_at: "not a date",
        },
        { status: 409 },
      ),
    );
    const odd = await POST(
      write("POST", "{}"),
      ctx("alerts", "al-1", "acknowledge"),
    );
    expect(await odd.json()).toEqual({
      code: "already_handled",
      status: "handled",
      handled_by: null,
      handled_at: null,
    });
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "already_decided", handled_by: { display_name: "X" } },
        { status: 409 },
      ),
    );
    const other = await POST(post("{}"), ctx("corrections", "c-1", "approve"));
    expect(await other.json()).toEqual({ code: "already_decided" });
  });
});

describe("analysis routes", () => {
  const as = (roles: Role[], mfaEnabled = true) =>
    writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: { ...TEST_USER, roles, mfaEnabled, features: { analysis: true } },
      steps: [],
    });
  const URL = "http://demo.test/api/v1/analysis";
  beforeEach(() => vi.stubEnv("ANALYSIS_SIGNED_OFF", "true"));

  it("the seven analysis shapes are accepted", async () => {
    await as(["clinician", "analyst"]);
    fetchMock.mockImplementation(async () => Response.json({}));
    const shapes = [
      ["filters"],
      ["prevalence"],
      ["affected"],
      ["co-occurring"],
      ["findings"],
      ["quality"],
      ["patients"],
    ];
    for (const rest of shapes) {
      const res = await GET(
        get(`${URL}/${rest[0]}?from=2026-01`),
        ctx("analysis", ...rest),
      );
      expect(res.status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      "http://api.test/api/v1/analysis/prevalence?from=2026-01",
    );
  });

  it("POST, `analysis/x` and `analysis/patients/1` are 404", async () => {
    await as(["clinician", "analyst"]);
    expect((await POST(post("{}"), ctx("analysis", "prevalence"))).status).toBe(
      404,
    );
    expect((await GET(get(`${URL}/x`), ctx("analysis", "x"))).status).toBe(404);
    expect(
      (await GET(get(`${URL}/patients/1`), ctx("analysis", "patients", "1")))
        .status,
    ).toBe(404);
    expect((await GET(get(URL), ctx("analysis"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ANALYSIS_SIGNED_OFF unset gives 404 before upstream, even when the session says on (Review Focus 5)", async () => {
    vi.stubEnv("ANALYSIS_SIGNED_OFF", "");
    await as(["clinician", "analyst"]);
    const res = await GET(get(`${URL}/filters`), ctx("analysis", "filters"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "not_found" });
    // Not even a missing session is reported first.
    jar.values.clear();
    expect(
      (await GET(get(`${URL}/filters`), ctx("analysis", "filters"))).status,
    ).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a clinician without analyst gets 403", async () => {
    await as(["clinician"]);
    const res = await GET(get(`${URL}/filters`), ctx("analysis", "filters"));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an analyst without two-step gets mfa_required", async () => {
    await as(["clinician", "analyst"], false);
    const res = await GET(get(`${URL}/filters`), ctx("analysis", "filters"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "mfa_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("clearance routes (Plan 11)", () => {
  const as = (roles: Role[] = ["hospital_admin"]) =>
    writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: {
        ...TEST_USER,
        roles,
        mfaEnabled: true,
        features: { analysis: true, named: true },
      },
      steps: [],
    });
  const BASE = "http://demo.test/api/v1";
  const BOUNDARY = "----mhaiTestBoundary7MA4YWxk";
  const MULTIPART = `multipart/form-data; boundary=${BOUNDARY}`;
  /** A multipart body of about `size` bytes, built by hand so its bytes are known. */
  const multipart = (size: number) => {
    const head = new TextEncoder().encode(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="letter.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${BOUNDARY}--\r\n`);
    const out = new Uint8Array(head.length + size + tail.length);
    out.set(head, 0);
    out.fill(0x25, head.length, head.length + size);
    out.set(tail, head.length + size);
    return out;
  };
  const upload = (
    body: BodyInit | null,
    type: string | null = MULTIPART,
    extra: Record<string, string> = {},
  ) =>
    new Request(`${BASE}/hospital/clearances`, {
      method: "POST",
      headers: {
        host: "demo.test",
        origin: "http://demo.test",
        ...(type ? { "content-type": type } : {}),
        ...extra,
      },
      body,
    });
  const write = (path: string[], body = "{}") =>
    new Request(`${BASE}/${path.join("/")}`, {
      method: "POST",
      headers: {
        host: "demo.test",
        origin: "http://demo.test",
        "content-type": "application/json",
      },
      body,
    });
  const png = () =>
    new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      headers: { "Content-Type": "image/png" },
    });
  const SHAPES: [string, string[]][] = [
    ["GET", ["hospital", "clearances"]],
    ["POST", ["hospital", "clearances"]],
    ["GET", ["hospital", "clearances", "cl_act"]],
    ["GET", ["hospital", "clearances", "cl_act", "pages", "1"]],
    ["POST", ["hospital", "clearances", "cl_act", "revoke"]],
    ["POST", ["hospital", "clearances", "cl_act", "narrow"]],
    ["GET", ["analysis", "named-access"]],
    ["GET", ["analysis", "clearance", "me"]],
  ];
  const run = (method: string, path: string[]) => {
    const c = ctx(...path);
    if (method === "GET") return GET(get(`${BASE}/${path.join("/")}`), c);
    if (path.length === 2) return POST(upload(multipart(16)), c);
    return POST(write(path), c);
  };
  beforeEach(() => {
    vi.stubEnv("ANALYSIS_SIGNED_OFF", "true");
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "true");
  });

  it("the eight clearance shapes are accepted", async () => {
    await as();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/pages/") ? png() : Response.json({}),
    );
    for (const [method, path] of SHAPES) {
      const res = await run(method, path);
      expect([method, path, res.status]).toEqual([method, path, 200]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(
      fetchMock.mock.calls.map(([url, init]) => [
        (init as RequestInit).method,
        url,
      ]),
    ).toEqual(
      SHAPES.map(([m, p]) => [m, `http://api.test/api/v1/${p.join("/")}`]),
    );
  });

  it("hospital/clearances/x/download and analysis/clearance/other are 404", async () => {
    await as();
    const refused: [string, string[]][] = [
      ["GET", ["hospital", "clearances", "x", "download"]],
      ["GET", ["analysis", "clearance", "other"]],
      ["GET", ["analysis", "clearance"]],
      ["GET", ["analysis", "clearances"]],
      ["GET", ["analysis", "named-access", "x"]],
      ["POST", ["analysis", "named-access"]],
      ["POST", ["analysis", "clearance", "me"]],
      ["GET", ["hospital", "clearances", "x", "pages"]],
      ["GET", ["hospital", "clearances", "x", "pages", "one"]],
      ["GET", ["hospital", "clearances", "x", "pages", "0"]],
      ["GET", ["hospital", "clearances", "x", "pages", "1", "y"]],
      ["GET", ["hospital", "clearances", "x", "revoke"]],
      ["POST", ["hospital", "clearances", "x"]],
      ["POST", ["hospital", "clearances", "x", "verify"]],
      ["POST", ["hospital", "clearances", "x", "pages", "1"]],
    ];
    for (const [method, path] of refused) {
      const res = await run(method, path);
      expect([method, path, res.status]).toEqual([method, path, 404]);
    }
    for (const fn of [PATCH, DELETE]) {
      const req = new Request(`${BASE}/hospital/clearances/x`, {
        method: fn === PATCH ? "PATCH" : "DELETE",
        headers: {
          host: "demo.test",
          origin: "http://demo.test",
          "content-type": "application/json",
        },
        body: "{}",
      });
      expect((await fn(req, ctx("hospital", "clearances", "x"))).status).toBe(
        404,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the key off gives 404 before upstream for every clearance shape", async () => {
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "");
    await as();
    for (const [method, path] of SHAPES) {
      const res = await run(method, path);
      expect([method, path, res.status]).toEqual([method, path, 404]);
      expect(await res.json()).toEqual({ code: "not_found" });
    }
    // Before the session: no session reads as 404 too, not 401.
    jar.values.clear();
    for (const [method, path] of SHAPES)
      expect((await run(method, path)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    // The rest of Analysis is unaffected.
    await as();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    expect(
      (await GET(get(`${BASE}/analysis/filters`), ctx("analysis", "filters")))
        .status,
    ).toBe(200);
  });

  it("level=named with the key off is 403 named_access_off before upstream", async () => {
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "false");
    await as(["clinician", "analyst"]);
    const patients = (search: string) =>
      GET(
        get(`${BASE}/analysis/patients${search}`),
        ctx("analysis", "patients"),
      );
    for (const search of [
      "?level=named",
      "?level=NAMED",
      "?level=",
      "?level=deidentified&level=named",
      "?from=2026-01&level=named",
    ]) {
      const res = await patients(search);
      expect([search, res.status]).toEqual([search, 403]);
      expect(await res.json()).toEqual({ code: "named_access_off" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => Response.json({}));
    expect((await patients("?level=deidentified")).status).toBe(200);
    expect((await patients("?from=2026-01")).status).toBe(200);
    // With the key on, the server decides.
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "true");
    expect((await patients("?level=named")).status).toBe(200);
    expect((fetchMock.mock.calls[2] as [string])[0]).toBe(
      "http://api.test/api/v1/analysis/patients?level=named",
    );
  });

  it("an upload that isn't multipart is 415", async () => {
    await as();
    const c = ctx("hospital", "clearances");
    for (const type of [
      "application/json",
      "application/pdf",
      "text/plain",
      "multipart/form-data",
      "multipart/form-data; boundary=",
      "multipart/mixed; boundary=abc",
      null,
    ]) {
      const res = await POST(upload(multipart(16), type), c);
      expect([type, res.status]).toEqual([type, 415]);
      expect(await res.json()).toEqual({ code: "file_type" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an 11 MB upload is 413 before upstream", async () => {
    await as();
    const c = ctx("hospital", "clearances");
    const res = await POST(upload(multipart(11 * 1024 * 1024)), c);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ code: "file_too_large" });
    // Just over the limit, by its length while reading.
    const over = await POST(upload(multipart(10 * 1024 * 1024 + 64 * 1024)), c);
    expect(over.status).toBe(413);
    // A declared length over the limit is refused without reading.
    const said = await POST(
      upload(multipart(16), MULTIPART, {
        "content-length": String(11 * 1024 * 1024),
      }),
      c,
    );
    expect(said.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
    // A JSON write elsewhere keeps its 64 KB limit.
    const big = await POST(
      write(
        ["hospital", "clearances", "x", "narrow"],
        "x".repeat(64 * 1024 + 1),
      ),
      ctx("hospital", "clearances", "x", "narrow"),
    );
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ code: "too_large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a 2 MB upload is forwarded with its boundary", async () => {
    await as();
    fetchMock.mockResolvedValueOnce(
      Response.json({ id: "cl_new" }, { status: 201 }),
    );
    const bytes = multipart(2 * 1024 * 1024);
    const res = await POST(
      upload(bytes, MULTIPART, { "Idempotency-Key": "k-1" }),
      ctx("hospital", "clearances"),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "cl_new" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/hospital/clearances");
    expect(init.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer tok",
      "Content-Type": MULTIPART,
      "Idempotency-Key": "k-1",
    });
    expect(new Uint8Array(init.body as Uint8Array)).toEqual(bytes);
  });

  it("an upload from another site is refused", async () => {
    await as();
    const res = await POST(
      upload(multipart(16), MULTIPART, { origin: "https://evil.test" }),
      ctx("hospital", "clearances"),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a page reply of text/html is 502 bad_gateway", async () => {
    await as();
    const path = ["hospital", "clearances", "cl_act", "pages", "2"];
    for (const type of [
      "text/html",
      "image/svg+xml",
      "application/octet-stream",
      "application/json",
      null,
    ]) {
      fetchMock.mockResolvedValueOnce(
        new Response("<script>alert(1)</script>", {
          headers: type ? { "Content-Type": type } : {},
        }),
      );
      const res = await GET(get(`${BASE}/${path.join("/")}`), ctx(...path));
      expect([type, res.status]).toEqual([type, 502]);
      expect(await res.json()).toEqual({ code: "bad_gateway" });
    }
  });

  it("a PNG page passes with no-store and nosniff", async () => {
    await as();
    const path = ["hospital", "clearances", "cl_act", "pages", "1"];
    fetchMock.mockResolvedValueOnce(png());
    const res = await GET(get(`${BASE}/${path.join("/")}`), ctx(...path));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://api.test/api/v1/${path.join("/")}`);
    expect(init.headers).toEqual({
      Accept: "image/png, image/jpeg",
      Authorization: "Bearer tok",
    });
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xd8]), {
        headers: { "Content-Type": "Image/JPEG; foo=bar" },
      }),
    );
    const jpeg = await GET(get(`${BASE}/${path.join("/")}`), ctx(...path));
    expect(jpeg.status).toBe(200);
    expect(jpeg.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("a 422 refusal keeps only checked ids or emails (Ruling 12)", async () => {
    await as();
    const refuse = async (body: object) => {
      fetchMock.mockResolvedValueOnce(Response.json(body, { status: 422 }));
      const res = await POST(
        upload(multipart(16)),
        ctx("hospital", "clearances"),
      );
      expect(res.status).toBe(422);
      return res.json();
    };
    expect(
      await refuse({ code: "not_eligible", ids: ["s-1", "s_2"], detail: "x" }),
    ).toEqual({ code: "not_eligible", ids: ["s-1", "s_2"] });
    expect(
      await refuse({
        code: "not_eligible_platform",
        emails: ["a.b@measured-health.example"],
        ids: ["s-1"],
      }),
    ).toEqual({
      code: "not_eligible_platform",
      emails: ["a.b@measured-health.example"],
    });
    // Anything malformed reads as the code alone.
    for (const body of [
      { code: "not_eligible", ids: ["../x"] },
      { code: "not_eligible", ids: "s-1" },
      { code: "not_eligible", ids: [] },
      {
        code: "not_eligible",
        ids: Array.from({ length: 21 }, (_, i) => `s${i}`),
      },
      { code: "not_eligible", emails: ["a@b.org"] },
      { code: "not_eligible_platform", emails: ["not an email"] },
      { code: "not_eligible_platform", emails: ["<a@b.org>"] },
      { code: "file_type", ids: ["s-1"] },
    ])
      expect(await refuse(body)).toEqual({ code: body.code });
    // Elsewhere, ids never pass.
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "not_eligible", ids: ["s-1"] }, { status: 422 }),
    );
    const other = await POST(
      write(["hospital", "staff", "invites"]),
      ctx("hospital", "staff", "invites"),
    );
    expect(await other.json()).toEqual({ code: "not_eligible" });
  });

  it("the hospital admin rules apply to clearances", async () => {
    for (const roles of [["clinician", "analyst"], ["clinician"]] as Role[][]) {
      await as(roles);
      const res = await GET(
        get(`${BASE}/hospital/clearances`),
        ctx("hospital", "clearances"),
      );
      expect(res.status).toBe(403);
    }
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: {
        ...TEST_USER,
        roles: ["hospital_admin"],
        mfaEnabled: false,
        features: { analysis: true, named: true },
      },
      steps: [],
    });
    const res = await POST(
      upload(multipart(16)),
      ctx("hospital", "clearances"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "mfa_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the person's named gate is checked too, before upstream", async () => {
    const user = (roles: Role[], features?: User["features"]) =>
      writeSession({
        token: "tok",
        expiresAt: Date.now() + 10 * 60_000,
        user: { ...TEST_USER, roles, mfaEnabled: true, features },
        steps: [],
      });
    const named = (search = "?level=named") =>
      GET(
        get(`${BASE}/analysis/patients${search}`),
        ctx("analysis", "patients"),
      );
    // Named off for this person (the API's flag off): 403 named_access_off on
    // every clearance shape and on a named list, for an admin or an analyst.
    for (const roles of [
      ["hospital_admin"],
      ["clinician", "hospital_admin"],
    ] as Role[][]) {
      await user(roles, { analysis: true });
      for (const [method, path] of SHAPES) {
        const res = await run(method, path);
        expect([method, path, res.status]).toEqual([method, path, 403]);
        expect(await res.json()).toEqual({ code: "named_access_off" });
      }
      const res = await named();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "named_access_off" });
    }
    await user(["clinician", "analyst"], { analysis: true });
    for (const path of [
      ["analysis", "named-access"],
      ["analysis", "clearance", "me"],
    ]) {
      const res = await GET(get(`${BASE}/${path.join("/")}`), ctx(...path));
      expect(await res.json()).toEqual({ code: "named_access_off" });
    }
    expect((await named()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    // A de-identified list still passes without named access.
    fetchMock.mockImplementation(async () => Response.json({}));
    expect((await named("?level=deidentified")).status).toBe(200);
    expect((await named("")).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an analyst reaches their own clearance but no letters; a platform account reaches nothing", async () => {
    const both = { analysis: true, named: true };
    await writeSession({
      token: "tok",
      expiresAt: Date.now() + 10 * 60_000,
      user: {
        ...TEST_USER,
        roles: ["clinician", "analyst"],
        mfaEnabled: true,
        features: both,
      },
      steps: [],
    });
    fetchMock.mockImplementation(async () => Response.json({}));
    for (const [method, path] of SHAPES) {
      const res = await run(method, path);
      expect([method, path, res.status]).toEqual([
        method,
        path,
        path[0] === "analysis" ? 200 : 403,
      ]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    for (const roles of [
      ["admin", "hospital_admin"],
      ["auditor", "clinician", "analyst"],
    ] as Role[][]) {
      await writeSession({
        token: "tok",
        expiresAt: Date.now() + 10 * 60_000,
        user: { ...TEST_USER, roles, mfaEnabled: true, features: both },
        steps: [],
      });
      for (const [method, path] of SHAPES) {
        const res = await run(method, path);
        expect([roles, method, path, res.status]).toEqual([
          roles,
          method,
          path,
          403,
        ]);
        expect(await res.json()).toEqual({ code: "forbidden" });
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
