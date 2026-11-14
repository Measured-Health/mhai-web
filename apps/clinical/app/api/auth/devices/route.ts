import { readSessionList } from "@mhai/api-client/server/sessions";
import { api } from "@/lib/server/api";
import { authCode, json } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

export async function GET() {
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    const r = await api<unknown>("/auth/sessions", { token: s.token });
    return Response.json(readSessionList(r), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
