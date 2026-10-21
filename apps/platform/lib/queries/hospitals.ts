"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type {
  DeactivateReason,
  Hospital,
  HospitalIn,
  HospitalPatch,
  HospitalStatus,
  HospitalSummary,
  StepUp,
} from "../api/contract";
import { queryKeys } from "./keys";

/** Every hospital list, whatever its filter. */
export const hospitalListKey = [...queryKeys.hospitals, "list"] as const;
/** One hospital's page. */
export const hospitalKey = (id: string) =>
  [...queryKeys.hospitals, "one", id] as const;

export type HospitalFilter = { status?: HospitalStatus; q?: string };

/** The hospital list for a filter, a page at a time. */
export function useHospitals(filter: HospitalFilter) {
  const q = filter.q?.trim() || undefined;
  return useInfiniteQuery({
    queryKey: [...hospitalListKey, filter.status ?? null, q ?? null],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listHospitals({
        status: filter.status,
        q,
        cursor: pageParam,
      }),
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    select: (d: InfiniteData<{ hospitals: HospitalSummary[] }>) =>
      d.pages.flatMap((p) => p.hospitals),
  });
}

/** Adds a hospital: one Idempotency-Key per submit, reused on its retries. */
export function useAddHospital() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: HospitalIn, key) =>
      getPlatformClient().addHospital(body, { idempotencyKey: key }),
    {
      onSuccess: () =>
        void qc.invalidateQueries({ queryKey: queryKeys.hospitals }),
    },
  );
}

/** One hospital, with its details, status and first admin. */
export function useHospital(id: string) {
  return useQuery({
    queryKey: hospitalKey(id),
    queryFn: () => getPlatformClient().getHospital(id),
  });
}

/** After a change: the page shows the reply; lists and the feed refetch. */
export function saved(qc: QueryClient, h: Hospital) {
  qc.setQueryData(hospitalKey(h.id), h);
  void qc.invalidateQueries({ queryKey: hospitalListKey });
  void qc.invalidateQueries({
    queryKey: [...queryKeys.activity, "feed", h.id],
  });
}

/** A write to one hospital whose reply is the updated hospital. */
function useHospitalWrite<V>(
  send: (v: V, key: string) => Promise<Hospital>,
  extra: { gcTime?: number } = {},
) {
  const qc = useQueryClient();
  return useKeyedMutation(send, { onSuccess: (h) => saved(qc, h) }, extra);
}

/** Saves the details; `version` is the one the edit started from. */
export function useUpdateHospital(id: string) {
  return useHospitalWrite((body: HospitalPatch, key) =>
    getPlatformClient().updateHospital(id, body, { idempotencyKey: key }),
  );
}

export type DeactivateInput = {
  reason: DeactivateReason;
  note?: string;
} & StepUp;
export type ReactivateInput = { reason: string } & StepUp;

/**
 * The step-up writes carry the person's two-step code in their variables,
 * so the cache forgets each call as soon as nothing watches it (gcTime 0).
 * Callers `reset()` after the answer, which lets it go at once.
 */
export function useDeactivate(id: string) {
  return useHospitalWrite(
    (body: DeactivateInput, key) =>
      getPlatformClient().deactivate(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

export function useReactivate(id: string) {
  return useHospitalWrite(
    (body: ReactivateInput, key) =>
      getPlatformClient().reactivate(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

export function useInviteAdmin(id: string) {
  return useHospitalWrite((body: { name: string; email: string }, key) =>
    getPlatformClient().inviteAdmin(id, body, { idempotencyKey: key }),
  );
}

export function useResendInvite(id: string) {
  return useHospitalWrite((inviteId: string, key) =>
    getPlatformClient().resendInvite(id, inviteId, { idempotencyKey: key }),
  );
}
