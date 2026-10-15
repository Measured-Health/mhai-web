import { api, apiBase } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import {
  clearSession,
  readSession,
  writeSession,
  type ServerSession,
} from "@/lib/server/session";

const ALLOWED = new Set(["queries", "feedback", "corrections", "readyz"]);
const REFRESH_WITHIN_MS = 5 * 60_000;
const MAX_BODY = 64 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;

async function refresh(s: ServerSession): Promise<ServerSession> {
  try {
    const r = await api<{ access_token: string; expires_in: number }>(
      "/auth/refresh",
      { method: "POST", token: s.token },
    );
    const next = {
      ...s,
      token: r.access_token,
      expiresAt: Date.now() + r.expires_in * 1000,
    };
    await writeSession(next);
    return next;
  } catch {
    return s; // still valid for a few minutes; the next call tries again
  }
}

/** Same-origin proxy for clinical calls: adds the token the browser never sees. */
async function handle(req: Request, ctx: RouteContext<"/api/v1/[...path]">) {
  const { path } = await ctx.params;
  if (
    !ALLOWED.has(path[0] ?? "") ||
    path.some((p) => p === "" || p === "." || p === "..")
  )
    return json(404, { code: "not_found" });
  if (req.method !== "GET" && !sameOrigin(req)) return forbidden();

  let s = await readSession();
  if (!s) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
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
