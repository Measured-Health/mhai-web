import "server-only";

/**
 * The BFF side of core's refresh contract (openapi `/auth/refresh`):
 * `POST /auth/refresh {refresh_token}` → `{access_token, expires_in,
 * refresh_token}`. The refresh token rotates on every use. A reuse within
 * 10 seconds of its rotation is 409 `conflict` (nothing revoked); a later
 * reuse revokes the whole session. So one refresh per refresh token: every
 * request still carrying the old token, here or arriving within the next
 * minute, gets the same newer pair instead of rotating again.
 *
 * Any failure is null: the caller keeps its current access token, which
 * is still valid, and a later call tries again.
 */

export type Refreshed = {
  token: string;
  refreshToken: string;
  expiresAt: number;
};

/** How long a result is kept for requests still carrying the old token. */
const KEEP_MS = 60_000;

export function createRefresher(
  /** Calls core: POST /auth/refresh with this body (no bearer token). */
  call: (body: { refresh_token: string }) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const inflight = new Map<string, Promise<Refreshed | null>>();

  async function doRefresh(refreshToken: string): Promise<Refreshed | null> {
    try {
      const r = (await call({ refresh_token: refreshToken })) as {
        access_token?: unknown;
        refresh_token?: unknown;
        expires_in?: unknown;
      } | null;
      if (
        typeof r?.access_token !== "string" ||
        !r.access_token ||
        typeof r.refresh_token !== "string" ||
        !r.refresh_token ||
        typeof r.expires_in !== "number" ||
        !Number.isFinite(r.expires_in) ||
        r.expires_in <= 0
      )
        return null;
      return {
        token: r.access_token,
        refreshToken: r.refresh_token,
        expiresAt: now() + r.expires_in * 1000,
      };
    } catch {
      return null;
    }
  }

  return {
    /** The rotated pair for this refresh token, or null (keep the current one). */
    refreshOnce(refreshToken: string): Promise<Refreshed | null> {
      if (!refreshToken) return Promise.resolve(null);
      let p = inflight.get(refreshToken);
      if (!p) {
        p = doRefresh(refreshToken);
        inflight.set(refreshToken, p);
        void p.then((r) => {
          if (!r) return void inflight.delete(refreshToken); // may retry later
          setTimeout(() => inflight.delete(refreshToken), KEEP_MS).unref?.();
        });
      }
      return p;
    },
    __resetForTests() {
      inflight.clear();
    },
  };
}

const DEFAULT_WITHIN_S = 300;

/**
 * Refresh when the access token has less than this left. 5 minutes, or
 * SESSION_REFRESH_WITHIN_S (1–3600 seconds; the live e2e sets it above the
 * token's lifetime so every call rotates).
 */
export function refreshWithinMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const v = env.SESSION_REFRESH_WITHIN_S ?? "";
  const n = /^[0-9]{1,4}$/.test(v) ? Number(v) : NaN;
  return (n >= 1 && n <= 3600 ? n : DEFAULT_WITHIN_S) * 1000;
}
