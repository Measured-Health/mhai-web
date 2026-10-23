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

/** The 15 audit shapes. */
const AUDIT_SHAPES: [Method, string][] = [
  ["GET", "platform/audit"],
  ["GET", "platform/audit/people"],
  ["GET", "platform/audit/hospitals"],
  ["GET", "platform/audit/{id}"],
  ["GET", "platform/audit/{id}/patients"],
  ["POST", "platform/audit/undisplayable"],
  ["GET", "platform/audit/named-access"],
  ["GET", "platform/audit/exports"],
  ["POST", "platform/audit/exports"],
  ["GET", "platform/audit/exports/{id}/file"],
  ["POST", "platform/audit/verify"],
  ["GET", "platform/audit/verify/status"],
  ["GET", "platform/audit/verify/runs"],
  ["GET", "platform/audit/verify/runs/{id}"],
  ["POST", "platform/audit/verify/runs/{id}/outcome"],
];

/** The 11 clearance and switch shapes (Plan 11b). */
const CLEARANCE_SHAPES: [Method, string][] = [
  ["GET", "platform/clearances"],
  ["GET", "platform/clearances/{id}"],
  ["GET", "platform/clearances/{id}/pages/{id}"],
  ["POST", "platform/clearances/{id}/verify"],
  ["POST", "platform/clearances/{id}/reject"],
  ["POST", "platform/clearances/{id}/revoke"],
  ["GET", "platform/named-access"],
  ["POST", "platform/named-access/requests"],
  ["POST", "platform/named-access/requests/{id}/approve"],
  ["POST", "platform/named-access/requests/{id}/cancel"],
  ["POST", "platform/named-access/lower"],
];

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
  ["GET", "platform/notifications"],
  ["POST", "platform/notifications/seen"],
  ["GET", "platform/me/analytics-email"],
  ["PUT", "platform/me/analytics-email"],
  ["GET", "platform/health"],
  ["GET", "platform/jobs"],
  ["POST", "platform/jobs/retry"],
  ["POST", "platform/jobs/cancel"],
  ["GET", "platform/legal-holds"],
  ["POST", "platform/legal-holds"],
  ["GET", "platform/legal-holds/{id}"],
  ["PATCH", "platform/legal-holds/{id}"],
  ["POST", "platform/legal-holds/{id}/lift"],
  ["POST", "platform/legal-holds/{id}/lift/approve"],
  ["POST", "platform/legal-holds/{id}/lift/cancel"],
  ["POST", "platform/legal-holds/{id}/lift/undo"],
  ["GET", "platform/settings"],
  ["GET", "platform/settings/retention/{id}/preview"],
  ["PUT", "platform/settings/retention/{id}"],
  ["PUT", "platform/settings/retention-pause"],
  ["PUT", "platform/settings/triage"],
  ["POST", "platform/settings/requests/{id}/approve"],
  ["POST", "platform/settings/requests/{id}/cancel"],
  ["POST", "platform/settings/feedback-buffer/reset"],
  ...AUDIT_SHAPES,
  ...CLEARANCE_SHAPES,
];
/** The writes an auditor may make: their own read state, and the audit ones. */
const AUDITOR_WRITES: [Method, string][] = [
  ["POST", "platform/notifications/seen"],
  ["POST", "platform/audit/undisplayable"],
  ["POST", "platform/audit/exports"],
  ["POST", "platform/audit/verify"],
  ["POST", "platform/audit/verify/runs/{id}/outcome"],
];
const FILE = "platform/audit/exports/{id}/file";
const PAGE = "platform/clearances/{id}/pages/{id}";
const PNG = new Uint8Array([137, 80, 78, 71]);
/** What upstream sends back: a file for the file shapes, JSON for the rest. */
const upstream = (shape: string) =>
  shape === FILE
    ? new Response("a,b\n", { headers: { "Content-Type": "text/csv" } })
    : shape === PAGE
      ? new Response(PNG, { headers: { "Content-Type": "image/png" } })
      : Response.json({ ok: true });
let n = 0;
const concrete = (shape: string) =>
  shape.split("/").map((p) => (p === "{id}" ? `id_${++n}-X` : p));
const WRITES = SHAPES.filter(
  ([m, shape]) =>
    m !== "GET" && !AUDITOR_WRITES.some(([am, as]) => am === m && as === shape),
);
const READS = SHAPES.filter(([m]) => m === "GET");

describe("platform API proxy", () => {
  it.each(SHAPES)(
    "every listed shape is forwarded for a platform admin: %s %s",
    async (method, shape) => {
      await session();
      fetchMock.mockResolvedValueOnce(upstream(shape));
      const path = concrete(shape);
      const res = await call(method, path, { body: '{"a":1}' });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      if (shape === FILE) expect(await res.text()).toBe("a,b\n");
      else if (shape === PAGE)
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
      else expect(await res.json()).toEqual({ ok: true });
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

  it("proxy: an auditor may POST seen but not PUT the preference", async () => {
    await session({ roles: ["auditor"] });
    fetchMock.mockResolvedValueOnce(Response.json({ unseen: 0 }));
    const seen = await call("POST", ["platform", "notifications", "seen"], {
      body: '{"ids":["ntf_1"]}',
      headers: { "idempotency-key": "k-seen-1" },
    });
    expect(seen.status).toBe(200);
    expect(await seen.json()).toEqual({ unseen: 0 });
    expect(calls()).toHaveLength(1);
    const [url, init] = calls()[0];
    expect(url).toBe("http://api.test/api/v1/platform/notifications/seen");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"ids":["ntf_1"]}');
    expect(headersOf(calls()[0]).get("Idempotency-Key")).toBe("k-seen-1");

    fetchMock.mockClear();
    const put = await call("PUT", ["platform", "me", "analytics-email"], {
      body: '{"mode":"critical","version":1}',
    });
    expect(put.status).toBe(403);
    expect(await put.json()).toEqual({ code: "forbidden" });
    // The exception is exactly one path: nearby writes stay refused.
    for (const [method, path] of [
      ["PUT", ["platform", "notifications", "seen"]],
      ["POST", ["platform", "notifications"]],
      ["POST", ["platform", "me", "analytics-email"]],
    ] as [Method, string[]][]) {
      const res = await call(method, path);
      expect([403, 404]).toContain(res.status);
    }
    // ...and the seen exception still needs this app's origin.
    const cross = await call("POST", ["platform", "notifications", "seen"], {
      origin: "http://evil.test",
    });
    expect(cross.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(READS)(
    "an auditor can read every GET shape: %s %s",
    async (method, shape) => {
      await session({ roles: ["auditor"] });
      fetchMock.mockResolvedValueOnce(
        shape === FILE || shape === PAGE
          ? upstream(shape)
          : Response.json({ items: [] }),
      );
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
    ["GET", ["platform", "notifications", "seen"]],
    ["POST", ["platform", "notifications"]],
    ["PUT", ["platform", "notifications", "seen"]],
    ["GET", ["platform", "notifications", "n1"]],
    ["POST", ["platform", "notifications", "n1", "seen"]],
    ["GET", ["platform", "me"]],
    ["POST", ["platform", "me", "analytics-email"]],
    ["PATCH", ["platform", "me", "analytics-email"]],
    ["GET", ["platform", "me", "tm_ada", "analytics-email"]],
    ["POST", ["platform", "health"]],
    ["GET", ["platform", "health", "x"]],
    ["POST", ["platform", "jobs"]],
    ["GET", ["platform", "jobs", "retry"]],
    ["GET", ["platform", "jobs", "j1"]],
    ["POST", ["platform", "jobs", "j1", "retry"]],
    ["PUT", ["platform", "jobs", "cancel"]],
    ["DELETE", ["platform", "jobs", "cancel"]],
    ["POST", ["platform", "legal-holds", "x", "lift", "approve", "extra"]],
    ["DELETE", ["platform", "legal-holds", "x"]],
    ["PUT", ["platform", "legal-holds", "x"]],
    ["GET", ["platform", "legal-holds", "x", "lift"]],
    ["POST", ["platform", "legal-holds", "x", "lift", "delete"]],
    ["POST", ["platform", "legal-holds", "..", "lift"]],
    ["PATCH", ["platform", "legal-holds"]],
    ["POST", ["platform", "settings"]],
    ["PUT", ["platform", "settings"]],
    ["GET", ["platform", "settings", "triage"]],
    ["POST", ["platform", "settings", "triage"]],
    ["GET", ["platform", "settings", "retention"]],
    ["GET", ["platform", "settings", "retention", "records"]],
    ["POST", ["platform", "settings", "retention", "records"]],
    ["PUT", ["platform", "settings", "retention", "records", "preview"]],
    ["GET", ["platform", "settings", "retention", "..", "preview"]],
    ["GET", ["platform", "settings", "retention-pause"]],
    ["DELETE", ["platform", "settings", "retention-pause"]],
    ["GET", ["platform", "settings", "requests"]],
    ["GET", ["platform", "settings", "requests", "x", "approve"]],
    ["POST", ["platform", "settings", "requests", "x", "approve", "y"]],
    ["POST", ["platform", "settings", "requests", "x"]],
    ["GET", ["platform", "settings", "feedback-buffer", "reset"]],
    ["POST", ["platform", "settings", "feedback-buffer"]],
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

  describe("the audit shapes", () => {
    const ok = () => fetchMock.mockResolvedValueOnce(Response.json({ ok: 1 }));

    it("the 15 audit shapes are accepted", async () => {
      expect(AUDIT_SHAPES).toHaveLength(15);
      for (const [method, shape] of AUDIT_SHAPES) {
        fetchMock.mockReset();
        await session();
        fetchMock.mockResolvedValueOnce(upstream(shape));
        const res = await call(method, concrete(shape), { body: "{}" });
        expect([method, shape, res.status]).toEqual([method, shape, 200]);
      }
    });

    it("an auditor may POST exports, verify, outcome and undisplayable", async () => {
      await session({ roles: ["auditor"] });
      for (const path of [
        ["platform", "audit", "exports"],
        ["platform", "audit", "verify"],
        ["platform", "audit", "verify", "runs", "run_1", "outcome"],
        ["platform", "audit", "undisplayable"],
      ]) {
        ok();
        const res = await call("POST", path, { body: "{}" });
        expect([path.join("/"), res.status]).toEqual([path.join("/"), 200]);
      }
      expect(calls()).toHaveLength(4);
    });

    it("an auditor still can't PUT the analytics email", async () => {
      await session({ roles: ["auditor"] });
      const res = await call("PUT", ["platform", "me", "analytics-email"]);
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("platform/audit/named-access is not read as an event id, and nor is verify", async () => {
      await session();
      ok();
      await call("GET", ["platform", "audit", "named-access"]);
      expect(calls()[0]![0]).toBe(
        "http://api.test/api/v1/platform/audit/named-access",
      );
      // A reserved word is never an {id}: no event, no patients list.
      for (const word of [
        "verify",
        "people",
        "hospitals",
        "undisplayable",
        "named-access",
        "exports",
      ]) {
        const res = await call("GET", ["platform", "audit", word, "patients"]);
        expect([word, res.status]).toEqual([word, 404]);
      }
      expect(calls()).toHaveLength(1);
    });

    it("platform/audit/a.b is 404", async () => {
      await session();
      const res = await call("GET", ["platform", "audit", "a.b"]);
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a 422 too_many_rows forwards rows and nothing else", async () => {
      await session();
      fetchMock.mockResolvedValueOnce(
        Response.json(
          { code: "too_many_rows", rows: 62310, detail: "secret", x: 1 },
          { status: 422 },
        ),
      );
      const res = await call("POST", ["platform", "audit", "exports"], {
        body: "{}",
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ code: "too_many_rows", rows: 62310 });
      // A rows that isn't an integer is dropped.
      fetchMock.mockResolvedValueOnce(
        Response.json({ code: "too_many_rows", rows: -5 }, { status: 422 }),
      );
      const bad = await call("POST", ["platform", "audit", "exports"], {
        body: "{}",
      });
      expect(await bad.json()).toEqual({ code: "too_many_rows" });
    });

    it("the file shape streams text/csv and application/zip with no-store", async () => {
      await session();
      for (const type of ["text/csv; charset=utf-8", "application/zip"]) {
        fetchMock.mockResolvedValueOnce(
          new Response("data", { headers: { "Content-Type": type } }),
        );
        const res = await call("GET", [
          "platform",
          "audit",
          "exports",
          "exp_1",
          "file",
        ]);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe(type);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(await res.text()).toBe("data");
      }
    });

    it("the file shape refuses text/html, text/csvfoo and a missing type with 502", async () => {
      await session();
      const path = ["platform", "audit", "exports", "exp_1", "file"];
      for (const type of ["text/html", "text/csvfoo", null]) {
        fetchMock.mockResolvedValueOnce(
          type === null
            ? new Response(new Uint8Array([60, 120]))
            : new Response("<script>x</script>", {
                headers: { "Content-Type": type },
              }),
        );
        const res = await call("GET", path);
        expect([type, res.status]).toEqual([type, 502]);
        expect(await res.json()).toEqual({ code: "bad_gateway" });
      }
    });
  });

  describe("the clearance and switch shapes", () => {
    const page = ["platform", "clearances", "cl_wait", "pages", "2"];

    it("the eleven shapes are accepted", async () => {
      expect(CLEARANCE_SHAPES).toHaveLength(11);
      for (const [method, shape] of CLEARANCE_SHAPES) {
        fetchMock.mockReset();
        await session();
        fetchMock.mockResolvedValueOnce(upstream(shape));
        const res = await call(method, concrete(shape), { body: "{}" });
        expect([method, shape, res.status]).toEqual([method, shape, 200]);
      }
    });

    it("auditor POSTs to verify, reject, revoke and the switch are refused before upstream", async () => {
      await session({ roles: ["auditor"] });
      for (const path of [
        ["platform", "clearances", "cl_wait", "verify"],
        ["platform", "clearances", "cl_wait", "reject"],
        ["platform", "clearances", "cl_wait", "revoke"],
        ["platform", "named-access", "requests"],
        ["platform", "named-access", "requests", "req_1", "approve"],
        ["platform", "named-access", "requests", "req_1", "cancel"],
        ["platform", "named-access", "lower"],
      ]) {
        const res = await call("POST", path, { body: "{}" });
        expect([path.join("/"), res.status]).toEqual([path.join("/"), 403]);
        expect(await res.json()).toEqual({ code: "forbidden" });
      }
      expect(fetchMock).not.toHaveBeenCalled();
      // They read and view letters.
      fetchMock.mockResolvedValueOnce(upstream(PAGE));
      expect((await call("GET", page)).status).toBe(200);
    });

    it("platform/clearances/x/download is 404", async () => {
      await session();
      for (const [method, path] of [
        ["GET", ["platform", "clearances", "x", "download"]],
        ["GET", ["platform", "clearances", "x", "file"]],
        ["GET", ["platform", "clearances", "x", "pages"]],
        ["GET", ["platform", "clearances", "x", "pages", "1", "raw"]],
        ["GET", ["platform", "clearances", "x", "pages", "1.png"]],
        ["POST", ["platform", "clearances"]],
        ["PATCH", ["platform", "clearances", "x"]],
        ["GET", ["platform", "clearances", "x", "verify"]],
        ["POST", ["platform", "clearances", "x", "narrow"]],
        ["PUT", ["platform", "named-access"]],
        ["GET", ["platform", "named-access", "requests"]],
        ["POST", ["platform", "named-access", "requests", "r", "deny"]],
        ["DELETE", ["platform", "named-access", "requests", "r"]],
        ["POST", ["platform", "named-access", "raise"]],
      ] as [Method, string[]][]) {
        const res = await call(method, path);
        expect([path.join("/"), res.status]).toEqual([path.join("/"), 404]);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a page passes as PNG or JPEG, inline, nosniff and no-store, asked for with an image Accept", async () => {
      await session();
      for (const type of ["image/png", "image/jpeg"]) {
        fetchMock.mockResolvedValueOnce(
          new Response(PNG, { headers: { "Content-Type": type } }),
        );
        const res = await call("GET", page);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe(type);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(res.headers.get("Content-Disposition")).toBe("inline");
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      }
      expect(headersOf(calls()[0]!).get("Accept")).toBe(
        "image/png, image/jpeg",
      );
      // JSON calls still ask for JSON, and an export isn't inline.
      fetchMock.mockResolvedValueOnce(Response.json({ clearances: [] }));
      await call("GET", ["platform", "clearances"]);
      expect(headersOf(calls()[2]!).get("Accept")).toBe("application/json");
      fetchMock.mockResolvedValueOnce(upstream(FILE));
      const exp = await call("GET", [
        "platform",
        "audit",
        "exports",
        "exp_1",
        "file",
      ]);
      expect(exp.headers.get("Content-Disposition")).toBeNull();
    });

    it("a text/html page is 502", async () => {
      await session();
      for (const type of ["text/html", "image/svg+xml", "image/pngx", null]) {
        fetchMock.mockResolvedValueOnce(
          type === null
            ? new Response(PNG)
            : new Response("<script>x</script>", {
                headers: { "Content-Type": type },
              }),
        );
        const res = await call("GET", page);
        expect([type, res.status]).toEqual([type, 502]);
        expect(await res.json()).toEqual({ code: "bad_gateway" });
      }
    });
  });

  describe("a background GET (X-MHAI-Background: 1)", () => {
    const BG = { "x-mhai-background": "1" };
    const TEN_MIN_AGO = () => Date.now() - 10 * 60_000;

    it("doesn't extend the session, is still checked and is not forwarded", async () => {
      const seenAt = TEN_MIN_AGO();
      await session({ lastSeenAt: seenAt });
      fetchMock.mockResolvedValueOnce(Response.json({ items: [], unseen: 0 }));
      const res = await call("GET", ["platform", "notifications"], {
        headers: BG,
      });
      expect(res.status).toBe(200);
      expect((await readSession())!.lastSeenAt).toBe(seenAt);
      expect(headersOf(calls()[0]!).has("x-mhai-background")).toBe(false);
    });

    it("is still refused for an idle session, even with polls in between", async () => {
      await session({ lastSeenAt: Date.now() - IDLE_LIMIT_MS - 1000 });
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      const res = await call("GET", ["platform", "notifications"], {
        headers: BG,
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ code: "session_expired" });
    });

    it("still refreshes a token that is near its end, without touching the idle clock", async () => {
      const seenAt = TEN_MIN_AGO();
      await session({ expiresInMs: 2 * 60_000, lastSeenAt: seenAt });
      fetchMock
        .mockResolvedValueOnce(
          Response.json({ access_token: "tok2", expires_in: 900 }),
        )
        .mockResolvedValueOnce(Response.json({}));
      await call("GET", ["platform", "notifications"], { headers: BG });
      const s = await readSession();
      expect(s!.token).toBe("tok2");
      expect(s!.lastSeenAt).toBe(seenAt);
    });

    it("GET platform/health with the header leaves lastSeenAt unchanged", async () => {
      const seenAt = TEN_MIN_AGO();
      await session({ lastSeenAt: seenAt });
      fetchMock.mockResolvedValueOnce(Response.json({}));
      const res = await call("GET", ["platform", "health"], { headers: BG });
      expect(res.status).toBe(200);
      expect((await readSession())!.lastSeenAt).toBe(seenAt);
    });

    it("a normal GET still extends the session", async () => {
      await session({ lastSeenAt: TEN_MIN_AGO() });
      fetchMock.mockResolvedValueOnce(Response.json({}));
      await call("GET", ["platform", "notifications"]);
      expect(Date.now() - (await readSession())!.lastSeenAt).toBeLessThan(
        5_000,
      );
    });

    it("a POST with the header is treated as a normal write and extends it", async () => {
      await session({ lastSeenAt: TEN_MIN_AGO() });
      fetchMock.mockResolvedValueOnce(Response.json({ unseen: 0 }));
      const res = await call("POST", ["platform", "notifications", "seen"], {
        headers: BG,
      });
      expect(res.status).toBe(200);
      expect(Date.now() - (await readSession())!.lastSeenAt).toBeLessThan(
        5_000,
      );
    });
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
