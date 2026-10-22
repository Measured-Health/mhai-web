"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { StepUp } from "../api/contract";
import type {
  HoldQuery,
  LegalHold,
  LegalHoldDetail,
  LiftReason,
  PlaceHoldIn,
} from "../api/holds-contract";
import { queryKeys } from "./keys";

/** Every holds list, whatever its filter. */
export const holdListKey = [...queryKeys.holds, "list"] as const;
/** One hold's page. */
export const holdKey = (id: string) => [...queryKeys.holds, "one", id] as const;

/** The holds for a filter, newest first, a page at a time. */
export function useHolds(filter: Omit<HoldQuery, "cursor">) {
  const q = filter.q?.trim() || undefined;
  return useInfiniteQuery({
    queryKey: [
      ...holdListKey,
      filter.status ?? "open",
      filter.hospital ?? null,
      q ?? null,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listHolds({
        status: filter.status,
        hospital: filter.hospital,
        q,
        cursor: pageParam,
      }),
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    select: (d): LegalHold[] => d.pages.flatMap((p) => p.holds),
  });
}

/** One hold, with its history. */
export function useHold(id: string) {
  return useQuery({
    queryKey: holdKey(id),
    queryFn: () => getPlatformClient().getHold(id),
  });
}

/**
 * Places a hold. The call carries the person's two-step code in its
 * variables, so the cache forgets it as soon as nothing watches it
 * (gcTime 0); callers `reset()` after the answer. A placement can move a
 * hospital's removal and writes to Activity, so those refetch too.
 */
export function usePlaceHold() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: PlaceHoldIn, key) =>
      getPlatformClient().placeHold(body, { idempotencyKey: key }),
    {
      onSuccess: () => {
        for (const queryKey of [
          queryKeys.holds,
          queryKeys.hospitals,
          queryKeys.activity,
        ])
          void qc.invalidateQueries({ queryKey });
      },
    },
    { gcTime: 0 },
  );
}

/**
 * After a change to a hold: its page shows the reply; the holds lists, the
 * hospitals (their holds and removal checks) and Activity refetch.
 */
export function holdSaved(qc: QueryClient, h: LegalHoldDetail) {
  qc.setQueryData(holdKey(h.id), h);
  for (const queryKey of [holdListKey, queryKeys.hospitals, queryKeys.activity])
    void qc.invalidateQueries({ queryKey });
}

/** A write to one hold whose reply is the updated hold. */
function useHoldWrite<V>(
  send: (v: V, key: string) => Promise<LegalHoldDetail>,
  extra: { gcTime?: number } = {},
) {
  const qc = useQueryClient();
  return useKeyedMutation(send, { onSuccess: (h) => holdSaved(qc, h) }, extra);
}

export type EditHoldInput = {
  review_on?: string;
  note?: string | null;
  version: number;
};
export type RequestLiftInput = {
  reason: LiftReason;
  note?: string;
  authority: string;
} & StepUp;

/** The review date and the note; no step-up. */
export function useEditHold(id: string) {
  return useHoldWrite((body: EditHoldInput, key) =>
    getPlatformClient().editHold(id, body, { idempotencyKey: key }),
  );
}

/*
 * Request, approve and undo carry the person's two-step code in their
 * variables, so the cache forgets each call as soon as nothing watches it
 * (gcTime 0). Callers `reset()` after every answer, which lets it go at once.
 */
export function useRequestLift(id: string) {
  return useHoldWrite(
    (body: RequestLiftInput, key) =>
      getPlatformClient().requestLift(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

export function useApproveLift(id: string) {
  return useHoldWrite(
    (body: { version: number } & StepUp, key) =>
      getPlatformClient().approveLift(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

/** Either platform admin; no step-up. */
export function useCancelLift(id: string) {
  return useHoldWrite((body: { version: number }, key) =>
    getPlatformClient().cancelLift(id, body, { idempotencyKey: key }),
  );
}

export function useUndoLift(id: string) {
  return useHoldWrite(
    (body: { version: number } & StepUp, key) =>
      getPlatformClient().undoLift(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

/** Re-reads one hold, e.g. after a refusal that says it changed. */
export function useRefreshHold(id: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: holdKey(id) });
}
