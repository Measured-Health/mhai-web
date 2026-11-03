import { createRefresher } from "@mhai/api-client/server/refresh";
import { api } from "./http";
import { writeSession, type ServerSession } from "./session";

export { refreshWithinMs } from "@mhai/api-client/server/refresh";

// `api` adds the platform audience header; no bearer token: the refresh
// token in the body is the credential (core's contract).
const refresher = createRefresher((body) =>
  api("/auth/refresh", { method: "POST", body }),
);

/** The rotated pair for this refresh token, or null (keep the current one). */
export const refreshOnce = (refreshToken: string) =>
  refresher.refreshOnce(refreshToken);

/**
 * The session with a fresh token, written back to the cookie (the idle clock
 * untouched); unchanged when it holds no refresh token or the refresh fails.
 */
export async function refreshSession(s: ServerSession): Promise<ServerSession> {
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
