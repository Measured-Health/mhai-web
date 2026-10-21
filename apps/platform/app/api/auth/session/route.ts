import { forbidden, json, sameOrigin, sessionExpired } from "@/lib/server/http";
import {
  clearSession,
  endSession,
  readSession,
  touchSession,
} from "@/lib/server/session";

/** The signed-in user and owed steps. Reading it doesn't count as activity. */
export async function GET() {
  const s = await readSession();
  if (!s) {
    await endSession();
    return sessionExpired();
  }
  return json(200, { user: s.user, steps: s.steps });
}

/**
 * Keep-alive: the screen calls this on activity and on "Stay signed in", so
 * the server's idle clock agrees with the screen's.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) {
    // No upstream call here: a keep-alive never touches the API.
    await clearSession();
    return sessionExpired();
  }
  await touchSession(s);
  return json(204);
}
