"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getClient } from "./api/client";
import type { FeedbackIn, QueryCreateIn } from "./api/contract";
import { titleFor, useSession } from "./session-store";

export function useSubmitQuery() {
  const session = useSession();
  return useMutation({
    mutationFn: (q: QueryCreateIn) => getClient().createQuery(q),
    onSuccess: ({ query_id }, q) =>
      session.add({
        id: query_id,
        title: titleFor(q),
        urgency: q.urgency,
        createdAt: Date.now(),
        query: q,
      }),
  });
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
  const q = useQuery({
    queryKey: ["status", id],
    queryFn: () => getClient().getStatus(id),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "completed" || s === "failed" || stalled ? false : 2000;
    },
    gcTime: 0,
  });
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
      if (
        last.current &&
        Date.now() - last.current.at >= stallMs &&
        status !== "completed" &&
        status !== "failed"
      )
        setStalledId(id);
    }, 1000);
    return () => clearInterval(t);
  }, [id, progress, stallMs, status]);
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
  return useMutation({
    mutationFn: (f: FeedbackIn) => getClient().sendFeedback(f),
  });
}
