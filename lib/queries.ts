"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getClient } from "./api/client";
import type { FeedbackIn, FeedbackOut, QueryCreateIn } from "./api/contract";
import { refreshCorrections } from "./correction-queries";
import {
  isTransient,
  pollDelay,
  retryDelay,
  shouldRetry,
  useNetwork,
} from "./network";
import { useOutbox } from "./offline/outbox-context";
import { isLocalId } from "./offline/outbox";
import { titleFor, useSession } from "./session-store";

export function useSubmitQuery() {
  const session = useSession();
  const m = useMutation({
    mutationFn: ({ q, key }: { q: QueryCreateIn; key: string }) =>
      getClient().createQuery(q, { idempotencyKey: key }),
    // Same key on every retry: the API answers a repeat with the first result.
    retry: (n, e) => shouldRetry(n, e),
    retryDelay,
    onSuccess: ({ query_id }, { q }) =>
      session.add({
        id: query_id,
        title: titleFor(q),
        urgency: q.urgency,
        createdAt: Date.now(),
        query: q,
      }),
  });
  return {
    ...m,
    mutate: (q: QueryCreateIn, options?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ q, key: crypto.randomUUID() }, options),
    mutateAsync: (
      q: QueryCreateIn,
      options?: Parameters<typeof m.mutateAsync>[1],
    ) => m.mutateAsync({ q, key: crypto.randomUUID() }, options),
  };
}

export function useQueryStatus(
  id: string,
  { stallMs = 120_000 }: { stallMs?: number } = {},
) {
  // Keyed by id so a reused hook instance never carries a stall to a new query.
  const [stalledId, setStalledId] = useState<string | null>(null);
  const stalled = stalledId === id;
  // Written only inside effects (react-hooks/purity and refs rules).
  const last = useRef<{ id: string; p: number; at: number } | null>(null);
  const startedAt = useRef<number | null>(null);
  const net = useNetwork();
  const q = useQuery({
    queryKey: ["status", id],
    queryFn: () => getClient().getStatus(id),
    // A question saved offline isn't on the server yet.
    enabled: !isLocalId(id),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === "completed" || s === "failed" || stalled || !net.online)
        return false;
      return pollDelay(Date.now() - (startedAt.current ?? Date.now()), net);
    },
    retry: (n, e) => shouldRetry(n, e),
    retryDelay,
    gcTime: 0,
  });
  useEffect(() => {
    startedAt.current = Date.now();
  }, [id]);
  // Time spent offline never counts towards the stall.
  useEffect(() => {
    if (net.online && last.current) last.current.at = Date.now();
  }, [net.online]);
  const progress = q.data?.progress ?? 0;
  const status = q.data?.status;
  useEffect(() => {
    if (
      last.current === null ||
      last.current.id !== id ||
      progress !== last.current.p
    )
      last.current = { id, p: progress, at: Date.now() };
    const t = setInterval(() => {
      // Offline ticks never count: keep pushing the progress time forward.
      if (!net.online) {
        if (last.current) last.current.at = Date.now();
        return;
      }
      if (
        last.current &&
        Date.now() - last.current.at >= stallMs &&
        status !== "completed" &&
        status !== "failed"
      )
        setStalledId(id);
    }, 1000);
    return () => clearInterval(t);
  }, [id, progress, stallMs, status, net.online]);
  return {
    status,
    progress,
    stage: q.data?.current_stage ?? null,
    stalled,
    error: q.error,
  };
}

export function useResult(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["result", id],
    queryFn: () => getClient().getResult(id),
    enabled: enabled && !isLocalId(id),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}

export function useFeedback() {
  const outbox = useOutbox();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async ({
      f,
      key,
    }: {
      f: FeedbackIn;
      key: string;
    }): Promise<FeedbackOut> => {
      // Offline: saved on this device (encrypted) and sent once back online.
      if (!navigator.onLine) {
        await outbox.queueFeedback(f);
        return { status: "queued" };
      }
      try {
        return await getClient().sendFeedback(f, { idempotencyKey: key });
      } catch (e) {
        // A weak connection (network error, timeout, rate limit or a server
        // error): save it on this device under the same key, so a send that
        // did reach the server isn't counted twice. The outbox keeps trying.
        // Anything else (a 4xx) won't change on retry: show the error.
        if (!isTransient(e)) throw e;
        await outbox.queueFeedback(f, key);
        return { status: "queued" };
      }
    },
    // The default ("online") pauses an offline mutation before mutationFn
    // runs, so the outbox branch above would never be reached.
    networkMode: "always",
    // The outbox retries, so the clinician isn't left waiting on backoff.
    retry: false,
    // A sent correction shows in My corrections; a queued one isn't sent yet.
    onSuccess: (r) => {
      if (r.status !== "queued") void refreshCorrections(qc);
    },
  });
  return {
    ...m,
    mutate: (f: FeedbackIn, options?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ f, key: crypto.randomUUID() }, options),
    mutateAsync: (
      f: FeedbackIn,
      options?: Parameters<typeof m.mutateAsync>[1],
    ) => m.mutateAsync({ f, key: crypto.randomUUID() }, options),
  };
}
