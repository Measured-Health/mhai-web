import { json, sessionExpired } from "@/lib/server/http";
import { endSession, readSession } from "@/lib/server/session";

/** The signed-in user and owed steps. Reading it doesn't count as activity. */
export async function GET() {
  const s = await readSession();
  if (!s) {
    await endSession();
    return sessionExpired();
  }
  return json(200, { user: s.user, steps: s.steps });
}
