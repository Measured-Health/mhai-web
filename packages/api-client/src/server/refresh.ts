import "server-only";
import { UpstreamError } from "./upstream";

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
 * core with a rotated-out token.
 *
 * Accepted residual risk (product owner's ruling, 3 Nov): for that minute,
 * someone holding an old sealed cookie gets the successor and never trips
 * core's reuse detection. They already hold that cookie's access token,
 * valid for up to 15 minutes, so the extra minute adds little; a 10-second
 * window instead revoked sessions mid-consultation. Bounded by: the chain
 * is dropped at sign-out, sign-out everywhere and any refresh that ends the
 * session (`forget`); past the minute a stale token goes to core unchanged,
 * so its reuse check and revocation run; and a loop or an over-long chain
 * resolves to nothing, so the token goes to core too.
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
/**
 * How long a forgotten token stays forgotten: past any successor's life and
 * any refresh still in flight (its request times out within 30 s).
 */
const FORGET_MS = KEEP_MS + 30_000;
/** Rotations followed by `successor`; past this it fails closed (no successor). */
const MAX_CHAIN = 8;

export function createRefresher(
  /** Calls core: POST /auth/refresh with this body (no bearer token). */
  call: (body: { refresh_token: string }) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const inflight = new Map<string, Promise<Refreshed | null>>();
  const resolved = new Map<string, Refreshed>();
  /** Tokens of ended sessions: never resolved again, even by a late reply. */
  const forgotten = new Set<string>();
  const tombstone = (t: string) => {
    forgotten.add(t);
    setTimeout(() => forgotten.delete(t), FORGET_MS).unref?.();
  };

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
    } catch (e) {
      // Core ended the session (unknown, revoked or reused token): nothing
      // in its chain may resolve any more.
      if (e instanceof UpstreamError && e.status === 401) forget(refreshToken);
      return null;
    }
  }

  /** Every token in the chain `refreshToken` belongs to, both ways. */
  function chainOf(refreshToken: string): Set<string> {
    const chain = new Set([refreshToken]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [from, to] of resolved)
        if (chain.has(from) !== chain.has(to.refreshToken)) {
          chain.add(from).add(to.refreshToken);
          grew = true;
        }
    }
    return chain;
  }

  /**
   * Drops the whole chain and tombstones every token in it: none resolves
   * here again, not even when a refresh still in flight answers later.
   */
  function forget(refreshToken: string) {
    for (const t of chainOf(refreshToken)) {
      resolved.delete(t);
      inflight.delete(t);
      tombstone(t);
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
        const mine = p;
        void p.then((r) => {
          if (!r) {
            if (inflight.get(refreshToken) === mine) inflight.delete(refreshToken);
            return; // may retry later
          }
          // Signed out while this was in flight: the session has ended, so
          // its successor is never kept (and is forgotten too).
          if (forgotten.has(refreshToken) || forgotten.has(r.refreshToken)) {
            tombstone(r.refreshToken);
            if (inflight.get(refreshToken) === mine) inflight.delete(refreshToken);
            return;
          }
          resolved.set(refreshToken, r);
          setTimeout(() => {
            if (inflight.get(refreshToken) === mine) inflight.delete(refreshToken);
            if (resolved.get(refreshToken) === r) resolved.delete(refreshToken);
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
      if (forgotten.has(refreshToken)) return null;
      let found: Refreshed | null = null;
      const seen = new Set([refreshToken]);
      let key = refreshToken;
      for (let i = 0; ; i++) {
        const next = resolved.get(key);
        if (!next) return found;
        if (forgotten.has(next.refreshToken)) return null;
        // A loop or an over-long chain: fail closed, the token goes to core.
        if (i >= MAX_CHAIN || seen.has(next.refreshToken)) return null;
        seen.add(next.refreshToken);
        found = next;
        key = next.refreshToken;
      }
    },
    /** Sign-out: nothing in this session's chain resolves any more. */
    forget,
    __resetForTests() {
      inflight.clear();
      resolved.clear();
      forgotten.clear();
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
