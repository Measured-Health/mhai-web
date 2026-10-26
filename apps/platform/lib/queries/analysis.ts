"use client";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { ApiError } from "@mhai/api-client/errors";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import type {
  AnalysisQuery,
  AnalysisStatus,
  DownloadIn,
  ScopeKind,
  ViewId,
} from "../api/analysis-contract";
import { getPlatformClient } from "../api/client";
import { analysisQueryParams } from "../analysis/filters";
import {
  readFilterOptions,
  readStatus,
  readView,
  type ViewRead,
  type ViewState,
} from "../analysis/read";
import { queryKeys } from "./keys";

// Analysis keys. Filters, scope, hospital, period and view sit only in the
// keys of the in-memory cache: never the URL, storage, the title or logs.
export const analysisKeys = {
  status: [...queryKeys.analysis, "status"] as const,
  /** Set by a 403 `analysis_off`; cleared only with the cache. */
  off: [...queryKeys.analysis, "off"] as const,
  filters: (scope: ScopeKind, hospital: string | null) =>
    [...queryKeys.analysis, "filters", scope, hospital] as const,
  view: (view: ViewId, q: AnalysisQuery) =>
    [...queryKeys.analysis, "view", view, analysisQueryParams(q)] as const,
};

export const isAnalysisOff = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code === "analysis_off";

/**
 * The switch went off while the page was open. Analysis stays off for the
 * rest of the session (until a reload or a fresh sign-in clears the
 * cache), whatever a later status says: a server that disagrees with
 * itself can't bring the page back, or start a request loop. The page and
 * the sidebar entry go at once, and every other analysis query is removed.
 * Nothing is asked again.
 */
export function analysisOff(qc: QueryClient) {
  qc.setQueryData(analysisKeys.off, true);
  // After the failing call has settled, so it isn't removed mid-flight.
  queueMicrotask(() => dropAnalysis(qc));
}

/** Removes every analysis query but the status and the off mark. */
export function dropAnalysis(qc: QueryClient) {
  qc.removeQueries({
    queryKey: queryKeys.analysis,
    predicate: (q) => q.queryKey[1] !== "status" && q.queryKey[1] !== "off",
  });
}

/** True once a 403 `analysis_off` has arrived in this session. */
function useAnalysisOff(): boolean {
  const q = useQuery({
    queryKey: analysisKeys.off,
    // Never fetched: only `analysisOff` writes it.
    queryFn: () => false,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data === true;
}

/** Wraps a read so a 403 `analysis_off` turns the whole area off. */
function guarded<T>(qc: QueryClient, read: () => Promise<T>) {
  return async () => {
    try {
      return await read();
    } catch (e) {
      if (isAnalysisOff(e)) analysisOff(qc);
      throw e;
    }
  };
}

const toState = <T>(q: {
  data?: ViewState<T>;
  isError: boolean;
}): ViewState<T> | undefined => (q.isError ? { status: "failed" } : q.data);

/**
 * The status, read through `readStatus`: undefined while it loads (or for
 * someone who can't ask: an auditor), failed when it fails or doesn't read,
 * and failed for good once a 403 `analysis_off` has arrived.
 */
export function useAnalysisStatus(
  enabled: boolean,
): ViewState<AnalysisStatus> | undefined {
  const qc = useQueryClient();
  const off = useAnalysisOff();
  const q = useQuery({
    queryKey: analysisKeys.status,
    queryFn: guarded(qc, () => getPlatformClient().getAnalysisStatus()),
    // Once off, never asked again in this session.
    enabled: enabled && !off,
    select: readStatus,
  });
  if (!enabled) return undefined;
  if (off) return OFF;
  return toState(q);
}
const OFF: ViewState<AnalysisStatus> = { status: "failed" };

/** The filter choices for a scope (no ward or source across hospitals). */
export function useAnalysisFilters(scope: ScopeKind, hospital: string | null) {
  const qc = useQueryClient();
  const select = useCallback(
    (raw: unknown) => readFilterOptions(raw, scope),
    [scope],
  );
  const off = useAnalysisOff();
  const q = useQuery({
    queryKey: analysisKeys.filters(scope, hospital),
    enabled: !off,
    queryFn: guarded(qc, () =>
      getPlatformClient().getAnalysisFilters(scope, hospital),
    ),
    select,
  });
  return { state: toState(q), retry: () => void q.refetch() };
}

/**
 * One view for one query, read against that query. Undefined while it
 * loads; a view that doesn't read is failed. A new query never shows the
 * last one's figures.
 */
export function useAnalysisView<V extends ViewId>(
  view: V,
  query: AnalysisQuery,
) {
  const qc = useQueryClient();
  const off = useAnalysisOff();
  const q = useQuery({
    queryKey: analysisKeys.view(view, query),
    enabled: !off,
    queryFn: guarded(qc, async (): Promise<Fetched<V>> => {
      const asked = { ...query };
      const raw = await getPlatformClient().getAnalysisView(view, asked);
      return { view, query: asked, raw };
    }),
    select: readFetched<V>,
  });
  const state: ViewRead<V> | undefined = q.isError
    ? { status: "failed" }
    : q.data;
  return { state, retry: () => void q.refetch() };
}

/** A view's reply with what was asked, so it is read against that. */
type Fetched<V extends ViewId> = {
  view: V;
  query: AnalysisQuery;
  raw: unknown;
};
const readFetched = <V extends ViewId>(f: Fetched<V>): ViewRead<V> =>
  readView(f.view, f.raw, f.query);

/**
 * Records a download before the file is made: one Idempotency-Key per
 * click. A 403 `analysis_off` turns the area off.
 */
export function useRecordDownload() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: DownloadIn, key) =>
      getPlatformClient().recordDownload(body, { idempotencyKey: key }),
    {
      onError: (e) => {
        if (isAnalysisOff(e)) analysisOff(qc);
      },
    },
  );
}
