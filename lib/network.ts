"use client";
import { useSyncExternalStore } from "react";
import { ApiError } from "./api/errors";

export interface Network {
  online: boolean;
  saveData: boolean;
  slow: boolean;
}
type Connection = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?(type: "change", fn: () => void): void;
  removeEventListener?(type: "change", fn: () => void): void;
};
const connection = (): Connection | undefined =>
  (navigator as Navigator & { connection?: Connection }).connection;

const SERVER: Network = { online: true, saveData: false, slow: false };
let snapshot: Network = SERVER;
function read(): Network {
  const c = connection();
  const next: Network = {
    online: navigator.onLine,
    saveData: c?.saveData === true,
    slow: c?.effectiveType === "slow-2g" || c?.effectiveType === "2g",
  };
  // Same object while nothing changed (useSyncExternalStore needs that).
  if (
    next.online !== snapshot.online ||
    next.saveData !== snapshot.saveData ||
    next.slow !== snapshot.slow
  )
    snapshot = next;
  return snapshot;
}
function subscribe(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  connection()?.addEventListener?.("change", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
    connection()?.removeEventListener?.("change", fn);
  };
}

/** Online state, 2G and data saver, live. */
export const useNetwork = () =>
  useSyncExternalStore(subscribe, read, () => SERVER);

/** Poll often at first, then back off; never faster than 5 s on 2G or data saver. */
export function pollDelay(
  elapsedMs: number,
  n: Pick<Network, "slow" | "saveData">,
) {
  const base =
    elapsedMs < 30_000 ? 2_000 : elapsedMs < 120_000 ? 5_000 : 10_000;
  return n.slow || n.saveData ? Math.max(base, 5_000) : base;
}

/** Retry network failures and 5xx; a 4xx won't change on retry. */
export function shouldRetry(failures: number, e: unknown, max = 3): boolean {
  if (e instanceof ApiError && e.status >= 400 && e.status < 500) return false;
  return failures < max;
}

/** Worth trying again later: a network error, timeout, rate limit or 5xx. */
export function isTransient(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  return e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500;
}

export const retryDelay = (attempt: number) =>
  Math.min(30_000, 1_000 * 2 ** attempt) * (0.5 + Math.random() / 2);
