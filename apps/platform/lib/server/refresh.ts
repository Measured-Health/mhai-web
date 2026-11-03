import { refresher, resolveCurrent } from "./refresher";
import { writeSession, type ServerSession } from "./session";

export { refreshWithinMs } from "@mhai/api-client/server/refresh";

/** The rotated pair for this refresh token, or null (keep the current one). */
export const refreshOnce = (refreshToken: string) =>
  refresher.refreshOnce(refreshToken);

/**
 * The session with a fresh token, written back to the cookie (the idle clock
 * untouched); unchanged when it holds no refresh token or the refresh fails.
 */
export async function refreshSession(s: ServerSession): Promise<ServerSession> {
  // Rotated lately by another request: use (and write) that pair, rather
  // than rotate again.
  const current = resolveCurrent(s);
  if (current !== s) {
    await writeSession(current);
    return current;
  }
  if (!s.refreshToken) return s;
  const r = await refreshOnce(s.refreshToken);
  if (!r) return s;
  const next = { ...s, ...r };
  await writeSession(next);
  return next;
}

export function __resetRefreshCacheForTests() {
  refresher.__resetForTests();
}
