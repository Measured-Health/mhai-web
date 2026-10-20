import { json } from "@/lib/server/http";
import { clearSession, readSession } from "@/lib/server/session";

export async function GET() {
  const s = await readSession();
  if (!s) {
    await clearSession();
    return json(401, { code: "session_expired" });
  }
  return json(200, { user: s.user, steps: s.steps });
}
