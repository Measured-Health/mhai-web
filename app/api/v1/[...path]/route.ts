import { isClinical } from "@/lib/auth/types";
import { apiBase } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { refreshOnce } from "@/lib/server/refresh";
import {
  clearSession,
  readSession,
  writeSession,
  type ServerSession,
} from "@/lib/server/session";

const ALLOWED = new Set(["queries", "feedback", "corrections", "readyz"]);
const REFRESH_WITHIN_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024;
const SEGMENT = /^[A-Za-z0-9_-]+$/; // ids are opaque; no dots, slashes or escapes
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;

const DECISIONS = new Set(["approve", "reject", "withdraw"]);
const MY_LISTS = new Set(["mine", "reviewed"]);

/** Corrections and feedback only take the shapes the client uses (Plan 3). */
function shapeAllowed(method: string, path: string[]): boolean {
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

/** Same-origin proxy for clinical calls: adds the token the browser never sees. */
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
  // Clinical calls are for clinicians who finished first sign-in only.
  if (!isClinical(s.user) || s.steps.length > 0) return forbidden();
  if (s.expiresAt - Date.now() < REFRESH_WITHIN_MS) s = await refresh(s);

  const body = req.method === "GET" ? undefined : await req.text();
  if (body && Buffer.byteLength(body) > MAX_BODY)
    return json(413, { code: "too_large" });

  const key = req.headers.get("idempotency-key");
  const url = `${apiBase()}/${path.map(encodeURIComponent).join("/")}${new URL(req.url).search}`;
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
    // Never echo upstream error text: keep only the problem code.
    const p = (await res.json().catch(() => null)) as { code?: unknown } | null;
    return json(res.status, {
      code: typeof p?.code === "string" ? p.code : "error",
    });
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
