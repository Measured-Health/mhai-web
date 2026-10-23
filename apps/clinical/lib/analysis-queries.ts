"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { READ_RETRY } from "@mhai/api-client/network";
import { getAnalysisClient } from "./api/analysis";
import type {
  AnalysisFilters,
  PatientLevel,
  ViewId,
  ViewOut,
} from "./api/analysis-contract";
import { isGuardedOut } from "./analysis/guards";
import { orderView } from "./analysis/order";
import {
  readFilterOptions,
  readPatients,
  readView,
  type ViewState,
} from "./analysis/read";

/** One patient list behind a shown count (Task 7's panel). */
export type PatientsQuery = {
  drill: string;
  level: PatientLevel;
  filters: AnalysisFilters;
};

/**
 * Everything Analysis loads sits under ["analysis"], so one call clears it
 * (sign-out, two-step needed). The filters are only ever in the key, never
 * in the URL or storage.
 */
export const ANALYSIS_KEYS = {
  all: ["analysis"] as const,
  filters: ["analysis", "filters"] as const,
  view: (view: ViewId, f: AnalysisFilters) =>
    ["analysis", "view", view, f] as const,
  patients: (q: PatientsQuery | null) => ["analysis", "patients", q] as const,
};

export const ANALYSIS_HREF = "/analysis";

function hideEvery(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(hideEvery);
  if (isGuardedOut(v))
    return {
      ...v,
      value: null,
      suppressed: true,
      ...("drill" in v ? { drill: null } : {}),
    };
  if (typeof v === "object" && v !== null)
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, hideEvery(x)]),
    );
  return v;
}

/**
 * With fewer than 5 patients, every number in the view reads "Fewer than
 * 5", zeros too, and nothing is drillable: a 0 beside a hidden group of so
 * few patients would narrow it down (Review Focus 2).
 */
export function hideAllWhenFew<V extends ViewId>(data: ViewOut[V]): ViewOut[V] {
  return data.patients.suppressed ? (hideEvery(data) as ViewOut[V]) : data;
}

/** The filter options, read and checked. */
export const useFilterOptions = () =>
  useQuery({
    queryKey: ANALYSIS_KEYS.filters,
    queryFn: async () =>
      readFilterOptions(await getAnalysisClient().getFilterOptions()),
    staleTime: 5 * 60_000,
    ...READ_RETRY,
  });

/**
 * One view for these filters; its data is the reader's `ViewState`, masked
 * when few, with its rows in the fixed order (hidden rows by name).
 */
export function useAnalysisView<V extends ViewId>(
  view: V,
  filters: AnalysisFilters,
): UseQueryResult<ViewState<ViewOut[V]>, unknown> {
  return useQuery({
    queryKey: ANALYSIS_KEYS.view(view, filters),
    queryFn: async (): Promise<ViewState<ViewOut[V]>> => {
      const s = readView(
        view,
        await getAnalysisClient().getView(view, filters),
      );
      return s.status === "ok"
        ? { status: "ok", data: orderView(view, hideAllWhenFew<V>(s.data)) }
        : s;
    },
    ...READ_RETRY,
  });
}

/** What a view frame shows: the reply, still loading, or waiting to reconnect. */
export type FrameState<T> =
  ViewState<T> | { status: "loading" } | { status: "offline" };

export function frameState<T>(
  q: UseQueryResult<ViewState<T>, unknown>,
): FrameState<T> {
  if (q.data) return q.data;
  if (q.isError) return { status: "failed" };
  if (q.fetchStatus === "paused") return { status: "offline" };
  return { status: "loading" };
}

/**
 * The de-identified patients behind one shown count; null loads nothing.
 * Never kept: the list leaves the cache as soon as nothing shows it.
 */
export const usePatients = (q: PatientsQuery | null) =>
  useQuery({
    queryKey: ANALYSIS_KEYS.patients(q),
    queryFn: async () =>
      readPatients(
        await getAnalysisClient().listPatients(q!),
        "deidentified",
        Date.now(),
      ),
    enabled: q !== null,
    gcTime: 0,
    // Fetched once per opening: a refetch would log a second viewing.
    staleTime: Infinity,
    refetchOnReconnect: false,
    ...READ_RETRY,
  });
