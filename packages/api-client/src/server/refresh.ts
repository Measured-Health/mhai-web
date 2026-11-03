import "server-only";

/**
 * The BFF side of core's refresh contract (openapi `/auth/refresh`):
 * `POST /auth/refresh {refresh_token}` → `{access_token, expires_in,
 * refresh_token}`. The refresh token rotates on every use. A reuse within
 * 10 seconds of its rotation is 409 `conflict` (nothing revoked); a later
 * reuse revokes the whole session and is audited as a reuse.
 *
 * The browser only learns the new pair when the request that rotated it
 * answers, which can take up to 30 s; meanwhile its other requests still
 * carry the old sealed cookie. So each rotation's successor is kept here
 * for a minute: a request with the old token gets the same newer pair (and
 * its cookie is rewritten with it, see `successor`) instead of reaching
 * core with a rotated-out token. Whoever holds the old sealed cookie
 * already holds the session, so this hands out nothing new.
 *
 * The cache is per process: one BFF instance per app (the demo runs one).
 * More than one needs a shared store (TODO.md).
 *
 * Any failure is null: the caller keeps its current access token, which
 * is still valid, and a later call tries again.
 */

export type Refreshed = {
  token: string;
  refreshToken: string;
  expiresAt: number;
};

/** How long a successor is kept: the longest request (30 s) and a margin. */
const KEEP_MS = 60_000;
/** Rotations followed by `successor`, at most. */
const MAX_CHAIN = 8;

export function createRefresher(
  /** Calls core: POST /auth/refresh with this body (no bearer token). */
  call: (body: { refresh_token: string }) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const inflight = new Map<string, Promise<Refreshed | null>>();
  const resolved = new Map<string, Refreshed>();

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
          resolved.set(refreshToken, r);
          setTimeout(() => {
            inflight.delete(refreshToken);
            resolved.delete(refreshToken);
          }, KEEP_MS).unref?.();
        });
      }
      return p;
    },
    /**
     * The newest pair this token was rotated to (following later rotations
     * too), or null when it hasn't been rotated here lately.
     */
    successor(refreshToken: string): Refreshed | null {
      let found: Refreshed | null = null;
      let key = refreshToken;
      for (let i = 0; i < MAX_CHAIN; i++) {
        const next = resolved.get(key);
        if (!next) break;
        found = next;
        key = next.refreshToken;
      }
      return found;
    },
    __resetForTests() {
      inflight.clear();
      resolved.clear();
    },
  };
}

const DEFAULT_WITHIN_S = 300;
/** Below the 15-minute token, so a refresh never runs on every call. */
const MAX_WITHIN_S = 600;
/** Development only (the live e2e: every call refreshes). */
const MAX_WITHIN_DEV_S = 3600;

/**
 * Refresh when the access token has less than this left: 5 minutes, or
 * SESSION_REFRESH_WITHIN_S, 1–600 seconds (1–3600 with
 * MHAI_DEPLOY_ENV=development, which the live e2e uses so that every call
 * rotates). Anything else is the default.
 */
export function refreshWithinMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const v = env.SESSION_REFRESH_WITHIN_S ?? "";
  const max =
    env.MHAI_DEPLOY_ENV === "development" ? MAX_WITHIN_DEV_S : MAX_WITHIN_S;
  const n = /^[0-9]{1,4}$/.test(v) ? Number(v) : NaN;
  return (n >= 1 && n <= max ? n : DEFAULT_WITHIN_S) * 1000;
}
