"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type {
  HospitalIn,
  HospitalStatus,
  HospitalSummary,
} from "../api/contract";
import { queryKeys } from "./keys";

export type HospitalFilter = { status?: HospitalStatus; q?: string };

/** The hospital list for a filter, a page at a time. */
export function useHospitals(filter: HospitalFilter) {
  const q = filter.q?.trim() || undefined;
  return useInfiniteQuery({
    queryKey: [
      ...queryKeys.hospitals,
      "list",
      filter.status ?? null,
      q ?? null,
    ],
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
