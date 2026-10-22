// @vitest-environment node
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

import { __resetRefreshCacheForTests } from "@/lib/server/refresh";
import {
  IDLE_LIMIT_MS,
  SESSION_COOKIE,
  readSession,
  writeSession,
  type FirstStep,
  type PlatformUser,
} from "@/lib/server/session";
import type { PlatformRole } from "@/lib/server/roles";
import { DELETE, GET, PATCH, POST, PUT } from "./[...path]/route";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("PLATFORM_SESSION_SECRET", "p".repeat(40));
  vi.stubEnv("MHAI_API_URL", "http://api.test/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  jar.values.clear();
  __resetRefreshCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const HANDLERS = { GET, POST, PATCH, PUT, DELETE } as const;
type Method = keyof typeof HANDLERS;

const ORIGIN = "http://platform.test";
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
function req(
  method: Method,
  path: string[],
  opts: {
    origin?: string | null;
    body?: string;
    headers?: object;
    query?: string;
  } = {},
) {
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  return new Request(`${ORIGIN}/api/v1/${path.join("/")}${opts.query ?? ""}`, {
    method,
    headers: {
      host: "platform.test",
      ...(origin ? { origin } : {}),
      ...(method === "GET" ? {} : { "content-type": "application/json" }),
      ...(opts.headers ?? {}),
    },
    body: method === "GET" ? undefined : (opts.body ?? "{}"),
  });
}
const call = (
  method: Method,
  path: string[],
  opts?: Parameters<typeof req>[2],
) =>
  (HANDLERS[method] as (r: Request, c: unknown) => Promise<Response>)(
    req(method, path, opts),
    ctx(path),
  );

const USER: PlatformUser = {
  id: "ada@measured-health.example",
  email: "ada@measured-health.example",
  name: "Ada",
  roles: ["platform_admin"],
  mfaEnabled: true,
  backupCodesLeft: 8,
};
async function session(
  over: {
    roles?: PlatformRole[];
    mfaEnabled?: boolean;
    steps?: FirstStep[];
    expiresInMs?: number;
    lastSeenAt?: number;
  } = {},
) {
  const now = Date.now();
  await writeSession({
    token: "tok",
    expiresAt: now + (over.expiresInMs ?? 10 * 60_000),
    lastSeenAt: over.lastSeenAt ?? now,
    user: {
      ...USER,
      roles: over.roles ?? USER.roles,
      mfaEnabled: over.mfaEnabled ?? true,
    },
    steps: over.steps ?? [],
  });
}

type Call = [string, RequestInit];
const calls = () => fetchMock.mock.calls as Call[];
const headersOf = (c: Call) => new Headers(c[1].headers);

/** The table from the brief: `{id}` stands for one opaque id. */
const SHAPES: [Method, string][] = [
  ["GET", "platform/hospitals"],
  ["POST", "platform/hospitals"],
  ["GET", "platform/hospitals/{id}"],
  ["PATCH", "platform/hospitals/{id}"],
  ["POST", "platform/hospitals/{id}/deactivate"],
  ["POST", "platform/hospitals/{id}/reactivate"],
  ["POST", "platform/hospitals/{id}/removal"],
  ["POST", "platform/hospitals/{id}/removal/approve"],
  ["POST", "platform/hospitals/{id}/removal/cancel"],
  ["GET", "platform/hospitals/{id}/sso"],
  ["PUT", "platform/hospitals/{id}/sso"],
  ["POST", "platform/hospitals/{id}/sso/test"],
  ["POST", "platform/hospitals/{id}/invites"],
  ["POST", "platform/hospitals/{id}/invites/{id}/resend"],
  ["GET", "platform/team"],
  ["POST", "platform/team/invites"],
  ["PATCH", "platform/team/{id}"],
  ["DELETE", "platform/team/{id}"],
  ["GET", "platform/activity"],
  ["GET", "platform/analytics"],
  ["GET", "platform/analytics/changes/{id}/series"],
  ["GET", "platform/analytics/hospitals/{id}/series"],
  ["PUT", "platform/analytics/changes/{id}/follow-up"],
  ["DELETE", "platform/analytics/changes/{id}/follow-up"],
];
let n = 0;
const concrete = (shape: string) =>
  shape.split("/").map((p) => (p === "{id}" ? `id_${++n}-X` : p));
const WRITES = SHAPES.filter(([m]) => m !== "GET");
const READS = SHAPES.filter(([m]) => m === "GET");

describe("platform API proxy", () => {
  it.each(SHAPES)(
    "every listed shape is forwarded for a platform admin: %s %s",
    async (method, shape) => {
      await session();
      fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
      const path = concrete(shape);
      const res = await call(method, path, { body: '{"a":1}' });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toEqual({ ok: true });
      expect(calls()).toHaveLength(1);
      const [url, init] = calls()[0];
      expect(url).toBe(`http://api.test/api/v1/${path.join("/")}`);
      expect(init.method).toBe(method);
      const h = headersOf(calls()[0]);
      expect(h.get("Authorization")).toBe("Bearer tok");
      expect(h.get("X-MHAI-Audience")).toBe("platform");
      if (method !== "GET") expect(init.body).toBe('{"a":1}');
    },
  );

  it.each(WRITES)(
    "an auditor's write to every non-GET shape is 403 forbidden and fetch is never called: %s %s",
    async (method, shape) => {
      await session({ roles: ["auditor"] });
      const res = await call(method, concrete(shape));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(READS)(
    "an auditor can read every GET shape: %s %s",
    async (method, shape) => {
      await session({ roles: ["auditor"] });
      fetchMock.mockResolvedValueOnce(Response.json({ items: [] }));
      const res = await call(method, concrete(shape));
      expect(res.status).toBe(200);
      expect(calls()).toHaveLength(1);
    },
  );

  it.each([
    ["GET", ["platform", "hospitals", "x", "y", "z"]],
    ["GET", ["hospital", "staff"]],
    ["GET", ["admin", "users"]],
    ["GET", ["platform", "hospitals", "..", "team"]],
    ["GET", ["platform", "hospitals", "%2e%2e"]],
    ["GET", ["platform", "hospitals", "."]],
    ["GET", ["platform", "hospitals", "a%2fb"]],
    ["GET", ["platform", "hospitals", ""]],
    ["GET", ["platform"]],
    ["GET", []],
    ["GET", ["platform", "team", "invites"]],
    ["GET", ["platform", "activity", "x"]],
    ["GET", ["auth", "refresh"]],
    ["POST", ["platform", "hospitals", "h1"]],
    ["DELETE", ["platform", "hospitals", "h1"]],
    ["PUT", ["platform", "hospitals", "h1"]],
    ["POST", ["platform", "hospitals", "h1", "delete"]],
    ["PATCH", ["platform", "team", "invites"]],
    ["DELETE", ["platform", "team", "invites"]],
    ["POST", ["platform", "team"]],
    ["POST", ["platform", "activity"]],
    ["POST", ["platform", "hospitals", "h1", "invites", "i1"]],
    ["GET", ["platform", "analytics", "x"]],
    ["GET", ["platform", "analytics", "changes"]],
    ["GET", ["platform", "analytics", "changes", "c1"]],
    ["GET", ["platform", "analytics", "changes", "c1", "follow-up"]],
    ["POST", ["platform", "analytics", "changes", "c1", "follow-up"]],
    ["PATCH", ["platform", "analytics", "changes", "c1", "follow-up"]],
    ["PUT", ["platform", "analytics", "changes", "c1", "series"]],
    ["PUT", ["platform", "analytics"]],
    ["GET", ["platform", "analytics", "hospitals", "h1"]],
    ["GET", ["platform", "analytics", "hospitals", "..", "series"]],
    ["DELETE", ["platform", "analytics", "hospitals", "h1", "series"]],
  ] as [Method, string[]][])(
    "unknown shapes are 404: %s %j",
    async (method, path) => {
      await session();
      const res = await call(method, path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ code: "not_found" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("refuses a write from another origin, or with none, before the session", async () => {
    await session();
    for (const origin of ["http://evil.test", null]) {
      const res = await call("POST", ["platform", "hospitals"], { origin });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with no session is 401 session_expired", async () => {
    const res = await call("GET", ["platform", "hospitals"]);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an idle session is 401 session_expired", async () => {
    await session({ lastSeenAt: Date.now() - IDLE_LIMIT_MS - 1000 });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await call("GET", ["platform", "hospitals"]);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(jar.values.has(SESSION_COOKIE)).toBe(false);
    // At most the idle token revoking itself; never a platform call.
    for (const [url] of calls()) expect(url).toMatch(/\/auth\/logout$/);
  });

  it("a session still owing steps is 403 forbidden and never calls upstream", async () => {
    for (const steps of [
      ["password", "terms", "mfa"],
      ["terms"],
      ["mfa"],
    ] as FirstStep[][]) {
      await session({ steps });
      for (const [method, path] of [
        ["GET", ["platform", "hospitals"]],
        ["POST", ["platform", "hospitals"]],
      ] as [Method, string[]][]) {
        const res = await call(method, path);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "forbidden" });
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no two-step is 403 mfa_required", async () => {
    await session({ mfaEnabled: false });
    const res = await call("GET", ["platform", "hospitals"]);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "mfa_required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an account with no platform role is 403 forbidden", async () => {
    await session({ roles: [] });
    const res = await call("GET", ["platform", "hospitals"]);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a bad Idempotency-Key is dropped, a good one forwarded", async () => {
    await session();
    fetchMock.mockImplementation(async () => Response.json({}));
    await call("POST", ["platform", "hospitals"], {
      headers: { "Idempotency-Key": "0b5c-11ef-AA" },
    });
    expect(headersOf(calls()[0]).get("Idempotency-Key")).toBe("0b5c-11ef-AA");
    for (const bad of ["bad key!", "a".repeat(65), "x/y", "k_1"]) {
      fetchMock.mockClear();
      await call("POST", ["platform", "hospitals"], {
        headers: { "Idempotency-Key": bad },
      });
      expect(headersOf(calls()[0]).has("Idempotency-Key")).toBe(false);
    }
  });

  it("forwards the query string on GET only", async () => {
    await session();
    fetchMock.mockImplementation(async () => Response.json({}));
    await call("GET", ["platform", "activity"], {
      query: "?hospital=h1&cursor=c",
    });
    expect(calls()[0][0]).toBe(
      "http://api.test/api/v1/platform/activity?hospital=h1&cursor=c",
    );
    await call("POST", ["platform", "hospitals"], { query: "?x=1" });
    expect(calls()[1][0]).toBe("http://api.test/api/v1/platform/hospitals");
  });

  it("refuses a body over 64 KB with 413", async () => {
    await session();
    const res = await call("POST", ["platform", "hospitals"], {
      body: JSON.stringify({ a: "x".repeat(64 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ code: "too_large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("409 blocked passes the blocking list through", async () => {
    await session();
    const blocking = [{ kind: "export", id: "e1", label: "Data export" }];
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "blocked", blocking, detail: "internal text" },
        { status: 409 },
      ),
    );
    const res = await call("POST", [
      "platform",
      "hospitals",
      "h1",
      "removal",
      "approve",
    ]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "blocked", blocking });
  });

  it.each([
    [403, "mfa_invalid"],
    [429, "mfa_locked"],
    [403, "mfa_required"],
    [409, "conflict"],
    [409, "same_person"],
    [409, "last_admin"],
    [409, "own_role"],
  ])(
    "passes an upstream %i %s through as only its code",
    async (status, code) => {
      await session();
      fetchMock.mockResolvedValueOnce(
        Response.json({ code, detail: "secret", blocking: ["x"] }, { status }),
      );
      const res = await call("POST", [
        "platform",
        "hospitals",
        "h1",
        "deactivate",
      ]);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ code });
    },
  );

  it("an upstream error without a code is just 'error'", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      new Response("<html>boom</html>", { status: 500 }),
    );
    const res = await call("GET", ["platform", "team"]);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "error" });
  });

  it("an upstream 401 clears the cookie and is 401 session_expired", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "unauthenticated" }, { status: 401 }),
    );
    const res = await call("GET", ["platform", "team"]);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "session_expired" });
    expect(jar.values.has(SESSION_COOKIE)).toBe(false);
    expect(calls()).toHaveLength(1);
  });

  it("an unreachable or slow upstream is 503 unavailable", async () => {
    await session();
    fetchMock.mockRejectedValueOnce(
      new DOMException("timeout", "TimeoutError"),
    );
    const res = await call("GET", ["platform", "team"]);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "unavailable" });
    expect(calls()[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("marks the session as used", async () => {
    await session({ lastSeenAt: Date.now() - 10 * 60_000 });
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await call("GET", ["platform", "team"]);
    const s = await readSession();
    expect(Date.now() - s!.lastSeenAt).toBeLessThan(5_000);
  });

  it("refreshes a token with under 5 minutes left, with the audience header", async () => {
    await session({ expiresInMs: 2 * 60_000 });
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ access_token: "tok2", expires_in: 900 }),
      )
      .mockResolvedValueOnce(Response.json({}));
    const res = await call("GET", ["platform", "team"]);
    expect(res.status).toBe(200);
    expect(calls()[0][0]).toBe("http://api.test/api/v1/auth/refresh");
    expect(headersOf(calls()[0]).get("X-MHAI-Audience")).toBe("platform");
    expect(headersOf(calls()[1]).get("Authorization")).toBe("Bearer tok2");
    expect((await readSession())!.token).toBe("tok2");
  });
});
