"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "@/lib/api/client";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { refreshCorrections } from "@/lib/correction-queries";
import { UNDO_WINDOW_MS } from "@/lib/corrections";
import { isTransient, retryDelay } from "@/lib/network";
import { approvalSession, registerPendingFlush } from "./pending-approvals";

/** Like reject and withdraw: a lost answer is tried again with the same key. */
const RETRIES = 2;

export interface PendingApproval {
  item: CorrectionOut;
  /** One key per Approve press, so a repeat never approves twice. */
  key: string;
  /** The sign-in it belongs to: never sent under another (or none). */
  session: number;
  endsAt: number;
}

type Live = {
  p: PendingApproval | null;
  timer: ReturnType<typeof setTimeout> | null;
};

/** Ends the live window (if any) and returns what was waiting. */
function take(live: { current: Live }): PendingApproval | null {
  const { p, timer } = live.current;
  if (timer) clearTimeout(timer);
  live.current = { p: null, timer: null };
  return p;
}

/**
 * Approve with a grace period (ruling R1). Nothing is sent until the window
 * ends, another decision starts, the page unmounts, the tab is hidden for
 * good (pagehide) or you sign out. Leaving confirms; only Undo cancels.
 */
export function useUndoableApproval({
  windowMs = UNDO_WINDOW_MS,
  onSent,
  onFailed,
}: {
  windowMs?: number;
  onSent(item: CorrectionOut): void;
  onFailed(item: CorrectionOut, e: unknown): void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingApproval | null>(null);
  // The live window, read by timers and listeners; written only in callbacks.
  const live = useRef<Live>({ p: null, timer: null });
  const handlers = useRef({ onSent, onFailed });
  useEffect(() => {
    handlers.current = { onSent, onFailed };
  });

  /** False once the view is gone: then a dropped send tells no one. */
  const mounted = useRef(false);

  const send = useCallback(
    (p: PendingApproval, keepalive: boolean): Promise<void> => {
      // Signed out (or someone else signed in) since Approve: it stays waiting.
      const stale = () => approvalSession() !== p.session;
      const drop = () => {
        if (mounted.current)
          handlers.current.onFailed(p.item, new ApiError(0, "network"));
      };
      if (stale()) {
        drop();
        return Promise.resolve();
      }
      // Decisions are never queued offline (R8): not sent, nothing changed.
      if (!navigator.onLine) {
        handlers.current.onFailed(p.item, new ApiError(0, "network"));
        return Promise.resolve();
      }
      // A retry waits here; a sign-out ends the wait early (`wake`).
      let timer: ReturnType<typeof setTimeout> | null = null;
      let wake: (() => void) | null = null;
      let last = keepalive;
      /** Waiting for the attempt that is running, or about to run. */
      let waiting: (() => void)[] = [];
      const settled = () => {
        const w = waiting;
        waiting = [];
        w.forEach((f) => f());
      };
      const tryNow = () => {
        if (timer) clearTimeout(timer);
        wake?.();
      };
      // The same key each time, so a retry never approves twice (R8). Not
      // after leaving the page (keepalive), never offline, and never under
      // another sign-in.
      const run = async () => {
        for (let n = 0; ; n++) {
          try {
            await getClient().approveCorrection(p.item.id, {
              idempotencyKey: p.key,
              keepalive,
            });
            return handlers.current.onSent(p.item);
          } catch (e) {
            const retry =
              !last && n < RETRIES && navigator.onLine && isTransient(e);
            if (!retry) return handlers.current.onFailed(p.item, e);
            settled();
            await new Promise<void>((r) => {
              wake = r;
              timer = setTimeout(r, retryDelay(n + 1));
            });
            timer = wake = null;
            if (stale()) return drop();
          }
        }
      };
      let job: Promise<void> | null = null;
      // Signing out: try now rather than wait, and settle once that try has
      // (retries go on, with the key, if the sign-out doesn't go ahead).
      // A new session: no more tries.
      const unregister = registerPendingFlush(
        () =>
          job
            ? new Promise<void>((r) => {
                waiting.push(r);
                tryNow();
              })
            : Promise.resolve(),
        () => {
          last = true;
          tryNow();
        },
      );
      job = run().finally(() => {
        unregister();
        settled();
        void refreshCorrections(qc);
      });
      return job;
    },
    [qc],
  );

  const flushWith = useCallback(
    (keepalive: boolean): Promise<void> => {
      const p = take(live);
      if (!p) return Promise.resolve();
      setPending(null);
      return send(p, keepalive);
    },
    [send],
  );

  const flush = useCallback(() => void flushWith(false), [flushWith]);

  const start = useCallback(
    (item: CorrectionOut) => {
      flushWith(false);
      const p: PendingApproval = {
        item,
        key: crypto.randomUUID(),
        session: approvalSession(),
        endsAt: Date.now() + windowMs,
      };
      live.current = { p, timer: setTimeout(() => flushWith(false), windowMs) };
      setPending(p);
    },
    [flushWith, windowMs],
  );

  const undo = useCallback((): CorrectionOut | null => {
    const p = take(live);
    if (!p) return null;
    setPending(null);
    return p.item;
  }, []);

  // Signing out sends it first, while the session still works.
  useEffect(() => registerPendingFlush(() => flushWith(false)), [flushWith]);

  // Leaving the page confirms: in-app (unmount) or the tab going away.
  useEffect(() => {
    mounted.current = true;
    const leave = () => void flushWith(true);
    window.addEventListener("pagehide", leave);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [flushWith]);

  return { pending, start, undo, flush };
}
