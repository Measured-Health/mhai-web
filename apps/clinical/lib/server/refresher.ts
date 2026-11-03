import { createRefresher } from "@mhai/api-client/server/refresh";
import { api } from "./api";

/**
 * This process's refresher (core's POST /auth/refresh {refresh_token}),
 * with each rotation's successor for a minute. Per process: one BFF
 * instance per app (TODO.md, "a shared refresh store").
 */
export const refresher = createRefresher((body) =>
  api("/auth/refresh", { method: "POST", body }),
);

/**
 * The session with the newest pair its refresh token was rotated to, if it
 * was rotated lately; otherwise the session as it is. Every cookie write
 * goes through this, so a request still carrying the old cookie never
 * writes the rotated-out pair back.
 */
export function resolveCurrent<
  T extends { token: string; refreshToken?: string | null; expiresAt: number },
>(s: T): T {
  const next = s.refreshToken ? refresher.successor(s.refreshToken) : null;
  return next ? { ...s, ...next } : s;
}
