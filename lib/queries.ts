"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getClient } from "./api/client";
import type { FeedbackIn, QueryCreateIn } from "./api/contract";
import { pollDelay, retryDelay, shouldRetry, useNetwork } from "./network";
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
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}

export function useFeedback() {
  const m = useMutation({
    mutationFn: ({ f, key }: { f: FeedbackIn; key: string }) =>
      getClient().sendFeedback(f, { idempotencyKey: key }),
    retry: (n, e) => shouldRetry(n, e),
    retryDelay,
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
