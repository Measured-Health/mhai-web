"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { HoldQuery, LegalHold, PlaceHoldIn } from "../api/holds-contract";
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
