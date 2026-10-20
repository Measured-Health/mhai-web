import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

export async function DELETE(
  req: Request,
  ctx: RouteContext<"/api/auth/devices/[id]">,
) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  const { id } = await ctx.params;
  // Session ids are opaque tokens. Anything else (".", "..", "/") could
  // rewrite the upstream path, so it never reaches the API.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
    return json(404, { code: "not_found" });
  try {
    await api(`/auth/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: s.token,
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  return json(204);
}
