"use client";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type {
  AnalyticsOut,
  Change,
  MeasureId,
  Period,
} from "../api/analytics-contract";
import { queryKeys } from "./keys";

/** Every area for one period (What changed is always the fixed window). */
export const analyticsKey = (period: Period) =>
  [...queryKeys.analytics, "summary", period] as const;

/** The page's data, raw: the page reads it (and the CSV writes it) itself. */
export function useAnalytics(period: Period) {
  return useQuery({
    queryKey: analyticsKey(period),
    queryFn: () => getPlatformClient().getAnalytics(period),
    // A new period keeps the last one on screen until it arrives.
    placeholderData: keepPreviousData,
  });
}

/** The selected change's measure for its hospital, with the others' median. */
export function useChangeSeries(changeId: string | null, period: Period) {
  return useQuery({
    queryKey: [...queryKeys.analytics, "change", changeId, period] as const,
    queryFn: () => getPlatformClient().getChangeSeries(changeId!, period),
    enabled: changeId !== null,
  });
}

/** One hospital against the median of the rest, for any measure. */
export function useHospitalSeries(
  hospitalId: string | null,
  measure: MeasureId,
  period: Period,
) {
  return useQuery({
    queryKey: [
      ...queryKeys.analytics,
      "hospital",
      hospitalId,
      measure,
      period,
    ] as const,
    queryFn: () =>
      getPlatformClient().getHospitalSeries(hospitalId!, measure, period),
    enabled: hospitalId !== null,
  });
}

/** Puts the server's reply for one change into every cached period. */
function savedChange(qc: QueryClient, c: Change) {
  qc.setQueriesData<AnalyticsOut>(
    { queryKey: [...queryKeys.analytics, "summary"] },
    (a) =>
      a && !("unavailable" in a.changes)
        ? {
            ...a,
            changes: {
              ...a.changes,
              items: a.changes.items.map((x) => (x.id === c.id ? c : x)),
            },
          }
        : a,
  );
  void qc.invalidateQueries({ queryKey: [...queryKeys.analytics, "summary"] });
  void qc.invalidateQueries({ queryKey: queryKeys.activity });
}

/** Someone else changed it first: show the latest. */
export function reloadAnalytics(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: [...queryKeys.analytics, "summary"] });
}

export type FollowUpInput = { id: string; note?: string; version: number };

/**
 * Marks a change followed up, or edits its note: one Idempotency-Key per
 * submit, and the change's `version` (a stale one gets 409 `conflict`).
 */
export function useFollowUp() {
  const qc = useQueryClient();
  return useKeyedMutation(
    ({ id, ...body }: FollowUpInput, key) =>
      getPlatformClient().followUp(id, body, { idempotencyKey: key }),
    { onSuccess: (c) => savedChange(qc, c) },
  );
}

export function useUndoFollowUp() {
  const qc = useQueryClient();
  return useKeyedMutation(
    ({ id, version }: { id: string; version: number }, key) =>
      getPlatformClient().undoFollowUp(
        id,
        { version },
        { idempotencyKey: key },
      ),
    { onSuccess: (c) => savedChange(qc, c) },
  );
}
