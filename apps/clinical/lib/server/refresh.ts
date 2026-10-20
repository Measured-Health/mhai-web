import { api } from "./api";
import type { ServerSession } from "./session";

type Refreshed = Pick<ServerSession, "token" | "expiresAt">;

const KEEP_MS = 60_000;
// The backend denylists the old token on refresh, so concurrent requests (and
// ones still carrying the old cookie) must share one refresh per old token.
const inflight = new Map<string, Promise<Refreshed | null>>();

async function doRefresh(token: string): Promise<Refreshed | null> {
  try {
    const r = await api<{ access_token?: unknown; expires_in?: unknown }>(
      "/auth/refresh",
      { method: "POST", token },
    );
    if (
      typeof r?.access_token !== "string" ||
      !r.access_token ||
      typeof r.expires_in !== "number" ||
      !Number.isFinite(r.expires_in) ||
      r.expires_in <= 0
    )
      return null;
    return {
      token: r.access_token,
      expiresAt: Date.now() + r.expires_in * 1000,
    };
  } catch {
    return null;
  }
}

/** The refreshed token for this old one, or null (keep using the old one). */
export function refreshOnce(oldToken: string): Promise<Refreshed | null> {
  let p = inflight.get(oldToken);
  if (!p) {
    p = doRefresh(oldToken);
    inflight.set(oldToken, p);
    void p.then((r) => {
      if (!r) return void inflight.delete(oldToken); // a failure may retry
      setTimeout(() => inflight.delete(oldToken), KEEP_MS).unref?.();
    });
  }
  return p;
}

export function __resetRefreshCacheForTests() {
  inflight.clear();
}
