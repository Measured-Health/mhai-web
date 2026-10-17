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
import type { Role } from "@/lib/auth/types";
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
