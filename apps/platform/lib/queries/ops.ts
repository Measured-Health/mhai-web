"use client";
import {
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getPlatformClient } from "@/lib/api/client";
import type { CancelReason, JobQuery } from "@/lib/api/ops-contract";
import type { StepUp } from "@/lib/api/contract";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { queryKeys } from "./keys";

/** Failed jobs, newest first, a page at a time. */
export function useJobs(filter: Omit<JobQuery, "cursor">) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.ops, "jobs", filter] as const,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listJobs({
        ...filter,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    refetchOnMount: "always",
  });
}

/** A job write changes the lists, the counts and the activity feed. */
function refresh(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.ops });
  void qc.invalidateQueries({ queryKey: queryKeys.activity });
}

export function useRetryJobs() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (ids: string[], key) =>
      getPlatformClient().retryJobs({ ids }, { idempotencyKey: key }),
    { onSuccess: () => refresh(qc) },
  );
}

export type CancelJobsInput = {
  ids: string[];
  reason: CancelReason;
  note?: string;
} & StepUp;

/**
 * Carries the person's two-step code, so the cache forgets the call as soon
 * as nothing watches it (gcTime 0). Run it through `useStepUpCall`, which
 * resets it after every answer.
 */
export function useCancelJobs() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: CancelJobsInput, key) =>
      getPlatformClient().cancelJobs(body, { idempotencyKey: key }),
    { onSuccess: () => refresh(qc) },
    { gcTime: 0 },
  );
}
