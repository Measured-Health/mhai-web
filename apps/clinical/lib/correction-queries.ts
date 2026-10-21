"use client";
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getClient } from "./api/client";
import type { RejectIn } from "./api/contract";
import { ApiError } from "./api/errors";
import {
  READ_RETRY,
  retryDelay,
  shouldRetry,
  usePollEvery,
} from "@mhai/api-client/network";

/** The queue and the sidebar badge. */
export const REVIEW_POLL_MS = 60_000;
/** Your own corrections: how decisions reach you (spec §10 item 1, R9). */
export const DECISION_POLL_MS = 30_000;

export const CORRECTION_KEYS = {
  all: ["corrections"] as const,
  pending: ["corrections", "pending"] as const,
  mine: ["corrections", "mine"] as const,
  reviewed: ["corrections", "reviewed"] as const,
  stats: ["feedback-stats"] as const,
};

const forbidden = (e: unknown) => e instanceof ApiError && e.status === 403;
export async function refreshCorrections(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: CORRECTION_KEYS.all }),
    qc.invalidateQueries({ queryKey: CORRECTION_KEYS.stats }),
  ]);
}

export function usePendingCorrections() {
  const every = usePollEvery(REVIEW_POLL_MS);
  return useQuery({
    queryKey: CORRECTION_KEYS.pending,
    queryFn: () => getClient().listPendingCorrections(),
    refetchInterval: (q) => (forbidden(q.state.error) ? false : every),
    ...READ_RETRY,
  });
}

export function useMyCorrections() {
  const every = usePollEvery(DECISION_POLL_MS);
  return useQuery({
    queryKey: CORRECTION_KEYS.mine,
    queryFn: () => getClient().listMyCorrections(),
    refetchInterval: every,
    ...READ_RETRY,
  });
}

export function useMyReviews() {
  return useQuery({
    queryKey: CORRECTION_KEYS.reviewed,
    queryFn: () => getClient().listMyReviews(),
    ...READ_RETRY,
  });
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: CORRECTION_KEYS.stats,
    queryFn: () => getClient().getMyFeedbackStats(),
    staleTime: 60_000,
    ...READ_RETRY,
  });
}

/** Others' waiting corrections, for the sidebar; `forbidden` hides the entry (R3). */
export function useReviewBadge(): { count: number | null; forbidden: boolean } {
  const q = usePendingCorrections();
  return {
    count: q.data ? q.data.length : null,
    forbidden: forbidden(q.error),
  };
}

// Decisions retry network errors and 5xx with the same key, never offline (R8).
const WRITE_RETRY = {
  networkMode: "always" as const,
  retry: (n: number, e: unknown) => navigator.onLine && shouldRetry(n, e, 2),
  retryDelay,
};

/** Reject and withdraw, so their ids can be read while they're in flight. */
const DECIDING_KEY = ["corrections", "deciding"] as const;

/**
 * Ids being rejected or withdrawn from here, until the answer comes. A list
 * refresh can land first; it must not read as "decided elsewhere".
 */
export function useDecidingIds(): string[] {
  return useMutationState({
    filters: { mutationKey: DECIDING_KEY, status: "pending" },
    select: (m) => (m.state.variables as { id: string }).id,
  });
}

/**
 * `onDecided` runs as soon as the server agrees, before the lists refresh.
 * The refresh is not awaited, so the caller's own callbacks never wait on it.
 */
type DecisionHooks = { onDecided?(id: string): void };

export function useRejectCorrection(opts?: DecisionHooks) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationKey: DECIDING_KEY,
    mutationFn: ({ id, r, key }: { id: string; r: RejectIn; key: string }) =>
      getClient().rejectCorrection(id, r, { idempotencyKey: key }),
    ...WRITE_RETRY,
    onSuccess: (_d, v) => opts?.onDecided?.(v.id),
    onSettled: () => {
      void refreshCorrections(qc);
    },
  });
  return {
    ...m,
    mutate: (
      v: { id: string; r: RejectIn },
      options?: Parameters<typeof m.mutate>[1],
    ) => m.mutate({ ...v, key: crypto.randomUUID() }, options),
  };
}

export function useWithdrawCorrection(opts?: DecisionHooks) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationKey: DECIDING_KEY,
    mutationFn: ({ id, key }: { id: string; key: string }) =>
      getClient().withdrawCorrection(id, { idempotencyKey: key }),
    ...WRITE_RETRY,
    onSuccess: (_d, v) => opts?.onDecided?.(v.id),
    onSettled: () => {
      void refreshCorrections(qc);
    },
  });
  return {
    ...m,
    mutate: (v: { id: string }, options?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ ...v, key: crypto.randomUUID() }, options),
  };
}
