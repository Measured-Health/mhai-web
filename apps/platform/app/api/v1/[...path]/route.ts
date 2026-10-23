import { refreshOnce } from "@/lib/server/refresh";
import {
  apiBase,
  forbidden,
  json,
  platformFetch,
  sameOrigin,
  sessionExpired,
} from "@/lib/server/http";
import {
  clearSession,
  endSession,
  readSession,
  touchSession,
  writeSession,
  type ServerSession,
} from "@/lib/server/session";

const REFRESH_WITHIN_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024;
const TIMEOUT_MS = 30_000;
const ID = /^[A-Za-z0-9_-]+$/; // ids are opaque; no dots, slashes or escapes
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Exactly the calls the platform client makes, and nothing else. `{id}`
 * stands for one opaque id; every other segment must match exactly.
 */
const SHAPES: readonly (readonly [string, string])[] = [
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

/** The one shape that returns a file, not JSON. */
const FILE_SHAPE = "GET platform/audit/exports/{id}/file";
const FILE_TYPES = ["text/csv", "application/zip"];

/**
 * The only writes an auditor may make, as `METHOD shape` rows of the table
 * above: marking notifications seen is their own read state, and the audit
 * writes (reporting an entry, exporting, running a check, noting its outcome)
 * are the auditor's job. None of them is an admin action. Every other
 * write needs a platform admin.
 */
const AUDITOR_WRITES: ReadonlySet<string> = new Set([
  "POST platform/notifications/seen",
  "POST platform/audit/undisplayable",
  "POST platform/audit/exports",
  "POST platform/audit/verify",
  "POST platform/audit/verify/runs/{id}/outcome",
]);

const PATTERNS = SHAPES.map(([method, shape]) => ({
  method,
  shape,
  parts: shape.split("/"),
}));

/**
 * Words another shape uses at the same place, by the shape so far: an `{id}`
 * there may not be one of them (`platform/team/invites` is never a member).
 */
const RESERVED = new Map<string, Set<string>>();
for (const { parts } of PATTERNS)
  parts.forEach((part, i) => {
    if (part === "{id}") return;
    const before = parts.slice(0, i).join("/");
    RESERVED.set(before, (RESERVED.get(before) ?? new Set()).add(part));
  });

/** The listed shape this call matches, as `METHOD shape`, or null. */
function shapeOf(method: string, path: string[]): string | null {
  const match = PATTERNS.find(
    (p) =>
      p.method === method &&
      p.parts.length === path.length &&
      p.parts.every((part, i) => {
        const seg = path[i]!;
        if (part !== "{id}") return part === seg;
        const taken = RESERVED.get(p.parts.slice(0, i).join("/"));
        return ID.test(seg) && !taken?.has(seg);
      }),
  );
  return match ? `${match.method} ${match.shape}` : null;
}

async function refresh(s: ServerSession): Promise<ServerSession> {
  const r = await refreshOnce(s.token);
  if (!r) return s; // still valid for a few minutes; the next call tries again
  const next = { ...s, ...r };
  await writeSession(next);
  return next;
}

/**
 * The problem body sent back: only the code, plus who blocks a removal, and
 * how many entries an export would hold.
 */
function problem(status: number, p: Record<string, unknown> | null) {
  const code = typeof p?.code === "string" ? p.code : "error";
  if (status === 409 && code === "blocked" && Array.isArray(p?.blocking))
    return { code, blocking: p.blocking };
  if (
    status === 422 &&
    code === "too_many_rows" &&
    typeof p?.rows === "number" &&
    Number.isSafeInteger(p.rows) &&
    p.rows >= 0
  )
    return { code, rows: p.rows };
  return { code };
}

/**
 * Same-origin proxy for the platform API: adds the token the browser never
 * sees. Every check runs before anything goes upstream.
 */
async function handle(req: Request, ctx: RouteContext<"/api/v1/[...path]">) {
  const { path } = await ctx.params;
  const method = req.method;
  // 1. Only the listed shapes (method and path).
  const shape = shapeOf(method, path);
  if (shape === null) return json(404, { code: "not_found" });
  // 2. Writes must come from this app's pages.
  if (method !== "GET" && !sameOrigin(req)) return forbidden();
  // 3. A live session, else it's over (an idle token only revokes itself).
  let s = await readSession();
  if (!s) {
    await endSession();
    return sessionExpired();
  }
  // 4. No first sign-in steps still owed (password, terms, two-step).
  if (s.steps.length !== 0) return forbidden();
  // 5. Two-step is always on for platform accounts.
  if (s.user.mfaEnabled !== true) return json(403, { code: "mfa_required" });
  // 6. A platform role.
  const roles = s.user.roles;
  if (!Array.isArray(roles) || roles.length === 0) return forbidden();
  // 7. Auditors only read, except their own read state (AUDITOR_WRITES).
  if (
    method !== "GET" &&
    !roles.includes("platform_admin") &&
    !(roles.includes("auditor") && AUDITOR_WRITES.has(shape))
  )
    return forbidden();

  // A background GET (a poll, not the person) is read and checked like any
  // other, but leaves the idle clock alone. Writes ignore the header. It is
  // never forwarded: only the headers listed below go upstream.
  const background =
    method === "GET" && req.headers.get("x-mhai-background") === "1";
  if (!background) s = await touchSession(s);
  if (s.expiresAt - Date.now() < REFRESH_WITHIN_MS) s = await refresh(s);

  const body = method === "GET" ? undefined : await req.text();
  if (body && Buffer.byteLength(body) > MAX_BODY)
    return json(413, { code: "too_large" });

  const key = req.headers.get("idempotency-key");
  // Only reads carry filters; a write's query string is never forwarded.
  const search = method === "GET" ? new URL(req.url).search : "";
  const url = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${search}`;
  let res: Response;
  try {
    res = await platformFetch(url, {
      method,
      headers: {
        Accept:
          shape === FILE_SHAPE ? FILE_TYPES.join(", ") : "application/json",
        Authorization: `Bearer ${s.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key && IDEMPOTENCY_KEY.test(key) ? { "Idempotency-Key": key } : {}),
      },
      body: body || undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return json(503, { code: "unavailable" });
  }
  if (res.status === 401) {
    // Upstream already rejected the token: nothing to revoke.
    await clearSession();
    return sessionExpired();
  }
  if (!res.ok) {
    // Never echo upstream error text.
    const p = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return json(res.status, problem(res.status, p));
  }
  const type = res.headers.get("Content-Type") ?? "application/json";
  // A file is passed through only as a CSV or a ZIP, never as anything else.
  if (
    shape === FILE_SHAPE &&
    !FILE_TYPES.includes(type.split(";")[0]!.trim().toLowerCase())
  ) {
    await res.body?.cancel();
    return json(502, { code: "bad_gateway" });
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
