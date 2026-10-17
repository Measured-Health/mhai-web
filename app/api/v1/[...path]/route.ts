import { handledFields } from "@/lib/api/alert-handled";
import { canUse } from "@/lib/auth/types";
import { apiBase } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { refreshOnce } from "@/lib/server/refresh";
import {
  clearSession,
  readSession,
  writeSession,
  type ServerSession,
} from "@/lib/server/session";

const ALLOWED = new Set([
  "queries",
  "feedback",
  "corrections",
  "readyz",
  "hospital",
  "alerts",
  "me",
]);
// Anything else (HEAD, PUT, OPTIONS...) never reaches a read or write branch.
const METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
const REFRESH_WITHIN_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024;
const SEGMENT = /^[A-Za-z0-9_-]+$/; // ids are opaque; no dots, slashes or escapes
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;

const DECISIONS = new Set(["approve", "reject", "withdraw"]);
const MY_LISTS = new Set(["mine", "reviewed"]);
const STAFF_ACTIONS = new Set([
  "deactivate",
  "reactivate",
  "password-reset",
  "reset-mfa",
  "remind",
  "resend-invite",
]);
const OVERSIGHT_ACTIONS = new Set(["remind", "assign"]);
const READ_ONLY = new Set(["usage", "activity", "review-oversight"]);

/** The hospital admin side: exactly the shapes the admin client uses (Plan 4). */
function hospitalShape(method: string, path: string[]): boolean {
  const [, area, id, action] = path;
  const n = path.length;
  if (area === "staff") {
    if (n === 2) return method === "GET";
    if (n === 3)
      return id === "invites"
        ? method === "POST"
        : // DELETE carries the admin's two-step code (amendment 1).
          method === "PATCH" || method === "DELETE";
    return (
      n === 4 &&
      method === "POST" &&
      id !== "invites" &&
      STAFF_ACTIONS.has(action ?? "")
    );
  }
  if (area === "settings")
    return n === 2 && (method === "GET" || method === "PATCH");
  if (READ_ONLY.has(area ?? "")) return n === 2 && method === "GET";
  if (area === "corrections" && n === 4)
    return action === "eligible-reviewers"
      ? method === "GET"
      : method === "POST" && OVERSIGHT_ACTIONS.has(action ?? "");
  return false;
}

const ALERT_ACTIONS = new Set(["acknowledge", "dismiss"]);

/**
 * Patient alerts and your notification settings: exactly the shapes the
 * alerts client uses (Plan 5a). Under `me`, only GET and PATCH
 * `me/notification-settings`; every other `me/*` path is refused.
 */
function alertShape(method: string, path: string[]): boolean {
  const [first, second, third] = path;
  if (first === "me")
    return (
      path.length === 2 &&
      second === "notification-settings" &&
      (method === "GET" || method === "PATCH")
    );
  if (method === "GET")
    return (
      path.length === 1 || (path.length === 2 && second === "unread-count")
    );
  return (
    method === "POST" &&
    path.length === 3 &&
    second !== "unread-count" &&
    ALERT_ACTIONS.has(third ?? "")
  );
}

/** Only the shapes the clients use (Plans 3, 4 and 5a). */
function shapeAllowed(method: string, path: string[]): boolean {
  if (!METHODS.has(method)) return false;
  if (path[0] === "hospital") return hospitalShape(method, path);
  if (path[0] === "alerts" || path[0] === "me") return alertShape(method, path);
  // Clinical calls only read and post (Plans 1–3).
  if (method !== "GET" && method !== "POST") return false;
  const [first, second, third] = path;
  if (first === "corrections") {
    if (method === "GET")
      return (
        path.length === 1 || (path.length === 2 && MY_LISTS.has(second ?? ""))
      );
    return path.length === 3 && DECISIONS.has(third ?? "");
  }
  if (first === "feedback") {
    if (method === "GET")
      return path.length === 3 && second === "stats" && third === "mine";
    return path.length === 1;
  }
  return true;
}

async function refresh(s: ServerSession): Promise<ServerSession> {
  const r = await refreshOnce(s.token);
  if (!r) return s; // still valid for a few minutes; the next call tries again
  const next = { ...s, ...r };
  await writeSession(next);
  return next;
}

/** Same-origin proxy for clinical, alert and hospital admin calls: adds the token the browser never sees. */
async function handle(req: Request, ctx: RouteContext<"/api/v1/[...path]">) {
  const { path } = await ctx.params;
  if (
    !ALLOWED.has(path[0] ?? "") ||
    !path.every((p) => SEGMENT.test(p)) ||
    !shapeAllowed(req.method, path)
  )
    return json(404, { code: "not_found" });
  if (req.method !== "GET" && !sameOrigin(req)) return forbidden();

  let s = await readSession();
  if (!s) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
  // Each side is for its own role, after first sign-in (R2, Plan 4).
  // Everything outside `hospital` is clinical, including `alerts` and `me`
  // (Plan 5a). NOTE: that makes every future `me/*` route clinician-only too;
  // a `me` route meant for hospital admins needs its own area rule here.
  const area = path[0] === "hospital" ? "admin" : "clinical";
  if (!canUse(s.user, area) || s.steps.length > 0) return forbidden();
  // Every hospital admin must have two-step on (amendment 3).
  if (area === "admin" && s.user.mfaEnabled !== true)
    return json(403, { code: "mfa_required" });
  if (s.expiresAt - Date.now() < REFRESH_WITHIN_MS) s = await refresh(s);

  const body = req.method === "GET" ? undefined : await req.text();
  if (body && Buffer.byteLength(body) > MAX_BODY)
    return json(413, { code: "too_large" });

  const key = req.headers.get("idempotency-key");
  // Only reads carry filters; a write's query string is never forwarded.
  const search = req.method === "GET" ? new URL(req.url).search : "";
  const url = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${search}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${s.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key && IDEMPOTENCY_KEY.test(key) ? { "Idempotency-Key": key } : {}),
      },
      body: body || undefined,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch {
    return json(503, { code: "unavailable" });
  }
  if (res.status === 401) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
  if (!res.ok) {
    // Never echo upstream error text: keep only the problem code (and, for a
    // 409 already_handled on an alert, who and when, through the same helper
    // the live client uses).
    const p = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const code = typeof p?.code === "string" ? p.code : "error";
    return json(
      res.status,
      res.status === 409 && code === "already_handled" && path[0] === "alerts"
        ? { code, ...handledFields(p) }
        : { code },
    );
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
