import { readSessionList } from "@mhai/api-client/server/sessions";
import { api, authCode, json, sessionExpired } from "@/lib/server/http";
import { readSession, touchSession } from "@/lib/server/session";

export async function GET() {
  const s = await readSession();
  if (!s) return sessionExpired();
  // Viewing devices counts as activity.
  await touchSession(s);
  try {
    const r = await api<unknown>("/auth/sessions", { token: s.token });
    return json(200, readSessionList(r));
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
