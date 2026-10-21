"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { Hospital, StepUp } from "../api/contract";
import { hospitalKey, saved } from "./hospitals";

export type RequestRemovalInput = { reason: string } & StepUp;

/** How often a scheduled removal is checked until the backend says Removed. */
export const REMOVAL_POLL_MS = 15_000;

/** A removal write whose reply is the updated hospital (as Task 10's). */
function useRemovalWrite<V>(
  send: (v: V, key: string) => Promise<Hospital>,
  extra: { gcTime?: number } = {},
) {
  const qc = useQueryClient();
  return useKeyedMutation(send, { onSuccess: (h) => saved(qc, h) }, extra);
}

/**
 * Request and approve carry the person's two-step code in their variables,
 * so the cache forgets each call as soon as nothing watches it (gcTime 0).
 * Callers `reset()` after the answer, which lets it go at once.
 */
export function useRequestRemoval(id: string) {
  return useRemovalWrite(
    (body: RequestRemovalInput, key) =>
      getPlatformClient().requestRemoval(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

export function useApproveRemoval(id: string) {
  return useRemovalWrite(
    (body: StepUp, key) =>
      getPlatformClient().approveRemoval(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

export function useCancelRemoval(id: string) {
  return useRemovalWrite((_: void, key) =>
    getPlatformClient().cancelRemoval(id, { idempotencyKey: key }),
  );
}

/**
 * While a removal is scheduled, re-reads the hospital now and then so the
 * page moves to Removed when the backend has done it. Shares the page's
 * hospital query; adds no request otherwise.
 */
export function useWatchRemoval(h: Hospital) {
  const scheduled = h.status === "removal_scheduled";
  useQuery({
    queryKey: hospitalKey(h.id),
    queryFn: () => getPlatformClient().getHospital(h.id),
    enabled: scheduled,
    refetchInterval: scheduled ? REMOVAL_POLL_MS : false,
  });
}

/** Re-reads one hospital, e.g. after a refusal that says it changed or went. */
export function useRefreshHospital(id: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: hospitalKey(id) });
}
