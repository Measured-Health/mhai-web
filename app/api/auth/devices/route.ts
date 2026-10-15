import type { ApiSession } from "@/lib/api/auth-contract";
import { api } from "@/lib/server/api";
import { authCode, json } from "@/lib/server/http";
import { toDevice } from "@/lib/server/map-user";
import { readSession } from "@/lib/server/session";

export async function GET() {
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    const r = await api<ApiSession[]>("/auth/sessions", { token: s.token });
    return Response.json(r.map(toDevice), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
