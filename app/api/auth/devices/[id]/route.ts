import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  const { id } = await ctx.params;
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
