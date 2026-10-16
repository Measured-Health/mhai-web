import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { clearSession, readSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    await api("/auth/sessions/revoke-all", { method: "POST", token: s.token });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  await clearSession();
  return json(204);
}
