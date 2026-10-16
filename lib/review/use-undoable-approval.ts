"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "@/lib/api/client";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { refreshCorrections } from "@/lib/correction-queries";
import { UNDO_WINDOW_MS } from "@/lib/corrections";
import { isTransient, retryDelay } from "@/lib/network";

/** Like reject and withdraw: a lost answer is tried again with the same key. */
const RETRIES = 2;

export interface PendingApproval {
  item: CorrectionOut;
  /** One key per Approve press, so a repeat never approves twice. */
  key: string;
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
 * ends, another decision starts, the page unmounts or the tab is hidden for
 * good (pagehide). Leaving confirms; only Undo cancels.
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

  const send = useCallback(
    (p: PendingApproval, keepalive: boolean) => {
      // Decisions are never queued offline (R8): not sent, nothing changed.
      if (!navigator.onLine) {
        handlers.current.onFailed(p.item, new ApiError(0, "network"));
        return;
      }
      // The same key each time, so a retry never approves twice (R8). Not
      // after leaving the page (keepalive), and never offline.
      const attempt = (n: number): Promise<unknown> =>
        getClient()
          .approveCorrection(p.item.id, { idempotencyKey: p.key, keepalive })
          .catch((e: unknown) => {
            if (keepalive || n >= RETRIES || !navigator.onLine) throw e;
            if (!isTransient(e)) throw e;
            return new Promise((r) => setTimeout(r, retryDelay(n + 1))).then(
              () => attempt(n + 1),
            );
          });
      attempt(0)
        .then(
          () => handlers.current.onSent(p.item),
          (e: unknown) => handlers.current.onFailed(p.item, e),
        )
        .finally(() => void refreshCorrections(qc));
    },
    [qc],
  );

  const flushWith = useCallback(
    (keepalive: boolean) => {
      const p = take(live);
      if (!p) return;
      setPending(null);
      send(p, keepalive);
    },
    [send],
  );

  const flush = useCallback(() => flushWith(false), [flushWith]);

  const start = useCallback(
    (item: CorrectionOut) => {
      flushWith(false);
      const p: PendingApproval = {
        item,
        key: crypto.randomUUID(),
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

  // Leaving the page confirms: in-app (unmount) or the tab going away.
  useEffect(() => {
    const leave = () => flushWith(true);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [flushWith]);

  return { pending, start, undo, flush };
}
