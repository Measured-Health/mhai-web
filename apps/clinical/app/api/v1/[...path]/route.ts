import { LETTER_MAX_BYTES } from "@mhai/ui/clearances";
import { handledFields } from "@/lib/api/alert-handled";
import {
  canOpenNamedAccess,
  canUse,
  canUseNamedAccess,
  type User,
} from "@/lib/auth/types";
import { apiBase } from "@/lib/server/api";
import { analysisSignedOff, namedSignedOff } from "@/lib/server/features";
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
  "analysis",
]);
// Anything else (HEAD, PUT, OPTIONS...) never reaches a read or write branch.
const METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
const REFRESH_WITHIN_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024;
const SEGMENT = /^[A-Za-z0-9_-]+$/; // ids are opaque; no dots, slashes or escapes
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;
// A letter upload: the file plus the form's fields (Plan 11).
const UPLOAD_MAX = LETTER_MAX_BYTES + 64 * 1024;

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
  if (area === "clearances") return clearanceShape(method, path);
  if (READ_ONLY.has(area ?? "")) return n === 2 && method === "GET";
  if (area === "corrections" && n === 4)
    return action === "eligible-reviewers"
      ? method === "GET"
      : method === "POST" && OVERSIGHT_ACTIONS.has(action ?? "");
  return false;
}

const CLEARANCE_ACTIONS = new Set(["revoke", "narrow"]);
const PAGE_NUMBER = /^[1-9][0-9]{0,2}$/;

/**
 * Clearance letters, hospital side (Plan 11): list and upload, one letter,
 * one page image, revoke and narrow. Anything else is refused.
 */
function clearanceShape(method: string, path: string[]): boolean {
  const [, , , action, page] = path;
  switch (path.length) {
    case 2:
      return method === "GET" || method === "POST";
    case 3:
      return method === "GET";
    case 4:
      return method === "POST" && CLEARANCE_ACTIONS.has(action ?? "");
    case 5:
      return (
        method === "GET" && action === "pages" && PAGE_NUMBER.test(page ?? "")
      );
    default:
      return false;
  }
}

/**
 * Every path about named access: all 404 while the sign-off key is off. The
 * named list is `POST analysis/patients/named`, so its purpose and note are
 * in the body, never in a URL.
 */
const isClearancePath = ([first, second, third]: string[]) =>
  (first === "hospital" && second === "clearances") ||
  (first === "analysis" &&
    (second === "named-access" ||
      second === "clearance" ||
      (second === "patients" && third === "named")));

/**
 * A GET patient list asking for anything but the de-identified level:
 * always refused, because names are only ever the POST above.
 */
const asksForNames = (req: Request, [first, second]: string[]) =>
  first === "analysis" &&
  second === "patients" &&
  new URL(req.url).searchParams
    .getAll("level")
    .some((l) => l !== "deidentified");

/**
 * The person's own named gate, behind the key (defence in depth): letters
 * are for hospital admins with named access; the position, your clearance
 * and a named list for anyone with named access.
 */
const namedGateHolds = (path: string[], user: User) =>
  path[0] === "hospital" && path[1] === "clearances"
    ? canOpenNamedAccess(user)
    : isClearancePath(path)
      ? canUseNamedAccess(user)
      : true;

/** Only `POST hospital/clearances` carries a file (multipart). */
const isUpload = (method: string, path: string[]) =>
  method === "POST" &&
  path.length === 2 &&
  path[0] === "hospital" &&
  path[1] === "clearances";

/**
 * Replies that are files, not JSON (Plan 11): the shape, and the only types
 * it may carry. Anything else from upstream is 502 `bad_gateway`.
 */
const FILE_REPLIES: readonly {
  is: (method: string, path: string[]) => boolean;
  types: readonly string[];
}[] = [
  {
    // A letter's page, drawn by the server: never the file itself.
    is: (method, path) =>
      method === "GET" &&
      path[0] === "hospital" &&
      path[1] === "clearances" &&
      path[3] === "pages",
    types: ["image/png", "image/jpeg"],
  },
];

const fileTypes = (method: string, path: string[]) =>
  FILE_REPLIES.find((f) => f.is(method, path))?.types ?? null;

// RFC 2046 boundary characters; quoted, a boundary may hold a few more.
const MULTIPART =
  /^multipart\/form-data;\s*boundary=(?:"([0-9A-Za-z'()+_,./:=? -]{0,69}[0-9A-Za-z'()+_,./:=?-])"|([0-9A-Za-z'+_.-]{1,70}))\s*$/i;

/** The upload's Content-Type, rebuilt from its boundary, or null if it isn't multipart. */
function multipartType(header: string | null): string | null {
  const m = MULTIPART.exec(header ?? "");
  if (!m) return null;
  return `multipart/form-data; boundary=${m[1] !== undefined ? `"${m[1]}"` : m[2]}`;
}

/**
 * The body as bytes, or null when it's over `max`: by its declared length
 * first, then while reading, so an oversized body is never held whole.
 */
async function readCapped(req: Request, max: number) {
  if (Number(req.headers.get("content-length")) > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

const MAX_LISTED = 20;
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL =
  /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

/** A non-empty list of at most 20 strings, each passing `ok`; else null. */
const checkedList = (v: unknown, ok: (s: string) => boolean) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= MAX_LISTED &&
  v.every((x) => typeof x === "string" && x.length <= 254 && ok(x))
    ? (v as string[])
    : null;

/**
 * A refusal's body: the problem code only, except where the live clients
 * need more, each checked: an alert's who and when on a 409
 * `already_handled`, and a letter upload's refused people on a 422 (ids for
 * `not_eligible`, emails for `not_eligible_platform`).
 */
function refusal(
  status: number,
  path: string[],
  p: Record<string, unknown> | null,
): object {
  const code = typeof p?.code === "string" ? p.code : "error";
  if (status === 409 && code === "already_handled" && path[0] === "alerts")
    return { code, ...handledFields(p) };
  if (status === 422 && path[0] === "hospital" && path[1] === "clearances") {
    const ids =
      code === "not_eligible"
        ? checkedList(p?.ids, (x) => OPAQUE_ID.test(x))
        : null;
    if (ids) return { code, ids };
    const emails =
      code === "not_eligible_platform"
        ? checkedList(p?.emails, (x) => EMAIL.test(x))
        : null;
    if (emails) return { code, emails };
  }
  return { code };
}

const ANALYSIS_VIEWS = new Set([
  "filters",
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
  "patients",
]);

/**
 * Analysis reads: the seven views the analysis client uses (Plan 6), plus
 * the named-access position, your clearance and the named list (Plan 11).
 * The named list is the one POST: it records a view.
 */
const analysisShape = (method: string, [, second, third, ...rest]: string[]) =>
  rest.length === 0 &&
  (method === "POST"
    ? second === "patients" && third === "named"
    : method === "GET" &&
      (third === undefined
        ? ANALYSIS_VIEWS.has(second ?? "") || second === "named-access"
        : second === "clearance" && third === "me"));

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
  if (path[0] === "analysis") return analysisShape(method, path);
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
  // Off in live mode until signed off: nothing is checked or forwarded.
  if (path[0] === "analysis" && !analysisSignedOff())
    return json(404, { code: "not_found" });
  // Named access is off until it is signed off (Plan 11): everything about
  // it is 404. A GET list is only ever de-identified, key or no key.
  if (!namedSignedOff() && isClearancePath(path))
    return json(404, { code: "not_found" });
  if (asksForNames(req, path)) return json(403, { code: "named_access_off" });
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
  const area =
    path[0] === "hospital"
      ? "admin"
      : path[0] === "analysis"
        ? "analysis"
        : "clinical";
  if (!canUse(s.user, area) || s.steps.length > 0) return forbidden();
  // Every hospital admin, and anyone using Analysis, must have two-step on (amendment 3).
  if (area !== "clinical" && s.user.mfaEnabled !== true)
    return json(403, { code: "mfa_required" });
  // The key is on, but this person's named access may not be.
  if (!namedGateHolds(path, s.user))
    return json(403, { code: "named_access_off" });
  // A named list records a view: never sent upstream without a valid key.
  const key = req.headers.get("idempotency-key");
  if (
    req.method === "POST" &&
    path[0] === "analysis" &&
    !(key && IDEMPOTENCY_KEY.test(key))
  )
    return json(422, { code: "invalid" });
  if (s.expiresAt - Date.now() < REFRESH_WITHIN_MS) s = await refresh(s);

  let body: string | Uint8Array<ArrayBuffer> | undefined;
  let type: string | undefined;
  if (isUpload(req.method, path)) {
    // A letter: forwarded as bytes, with its own boundary.
    const multipart = multipartType(req.headers.get("content-type"));
    if (!multipart) return json(415, { code: "file_type" });
    const bytes = await readCapped(req, UPLOAD_MAX);
    if (!bytes) return json(413, { code: "file_too_large" });
    body = bytes;
    type = multipart;
  } else if (req.method !== "GET") {
    const text = await req.text();
    if (Buffer.byteLength(text) > MAX_BODY)
      return json(413, { code: "too_large" });
    if (text) {
      body = text;
      type = "application/json";
    }
  }
  const files = fileTypes(req.method, path);

  // Only reads carry filters; a write's query string is never forwarded.
  const search = req.method === "GET" ? new URL(req.url).search : "";
  const url = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${search}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers: {
        Accept: files ? files.join(", ") : "application/json",
        Authorization: `Bearer ${s.token}`,
        ...(type ? { "Content-Type": type } : {}),
        ...(key && IDEMPOTENCY_KEY.test(key) ? { "Idempotency-Key": key } : {}),
      },
      body,
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
    // Never echo upstream error text: keep only the problem code, and the
    // few checked details `refusal` allows.
    const p = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return json(res.status, refusal(res.status, path, p));
  }
  if (files) {
    // A file passes only as a type its shape allows, inline, never sniffed
    // or cached.
    const got = (res.headers.get("Content-Type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase();
    if (!files.includes(got)) {
      await res.body?.cancel().catch(() => {});
      return json(502, { code: "bad_gateway" });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": got,
        "Cache-Control": "no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
