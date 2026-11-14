"use client";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { READ_RETRY, retryDelay } from "@mhai/api-client/network";
import { getAnalysisClient } from "./api/analysis";
import type {
  AnalysisFilters,
  NamedPatientsIn,
  PeriodRef,
  ViewId,
  ViewOut,
} from "./api/analysis-contract";
import { useOptionalAuth } from "./auth/auth-context";
import { canUseNamedAccess } from "./auth/types";
import { isGuardedOut } from "./analysis/guards";
import { orderView } from "./analysis/order";
import {
  readClearanceMe,
  readFilterOptions,
  readPatients,
  readView,
  type ViewState,
} from "./analysis/read";
import {
  problemOf,
  shouldRetryAnalysis,
  type Problem,
} from "./analysis/states";

/** One patient list behind a shown count (Task 7's panel). */
export type PatientsQuery = {
  drill: string;
  /** Names are never asked for here: that is `useNamedPatients`, a POST. */
  level: "deidentified";
  filters: AnalysisFilters;
  /** The shown count it was opened from: the list's count must equal it. */
  cell?: number;
};

/**
 * One named view (Plan 11c): the request, frozen when names are asked for,
 * and its own Idempotency-Key, so a refetch is the same recorded view.
 */
export type NamedQuery = NamedPatientsIn & { idempotencyKey: string };

/**
 * Everything Analysis loads sits under ["analysis"], so one call clears it
 * (sign-out, two-step needed). The filters are only ever in the key, never
 * in the URL or storage. Named rows sit under ["analysis", "patients"], so
 * closing the panel drops them with the de-identified list.
 */
export const ANALYSIS_KEYS = {
  all: ["analysis"] as const,
  filters: (period: PeriodRef | null) =>
    ["analysis", "filters", period] as const,
  view: (view: ViewId, f: AnalysisFilters | null) =>
    ["analysis", "view", view, f] as const,
  patients: (q: PatientsQuery | null) => ["analysis", "patients", q] as const,
  namedAll: ["analysis", "patients", "named"] as const,
  named: (q: NamedQuery | null) =>
    ["analysis", "patients", "named", q] as const,
  position: ["analysis", "named-access"] as const,
  me: ["analysis", "clearance", "me"] as const,
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

/** Analysis reads: 5xx and network errors retry; `not_ready` and 4xx are shown at once. */
const ANALYSIS_RETRY = { retry: shouldRetryAnalysis, retryDelay };

/**
 * The answerable periods and one period's filter lists, read and checked:
 * the latest finished month's with no period. With `enabled` false, asks
 * nothing.
 */
export const useFilterOptions = (period: PeriodRef | null, enabled = true) =>
  useQuery({
    queryKey: ANALYSIS_KEYS.filters(period),
    queryFn: async () =>
      readFilterOptions(
        await getAnalysisClient().getFilterOptions(period ?? undefined),
      ),
    enabled,
    staleTime: 5 * 60_000,
    ...ANALYSIS_RETRY,
  });

/**
 * One view for these filters (null, while the period's lists load, asks
 * nothing); its data is the reader's `ViewState`, masked when few, with its
 * rows in the fixed order (hidden rows by name). A reply for any other
 * period than the one asked fails.
 */
export function useAnalysisView<V extends ViewId>(
  view: V,
  filters: AnalysisFilters | null,
): UseQueryResult<ViewState<ViewOut[V]>, unknown> {
  return useQuery({
    queryKey: ANALYSIS_KEYS.view(view, filters),
    queryFn: async (): Promise<ViewState<ViewOut[V]>> => {
      const f = filters!;
      const s = readView(
        view,
        await getAnalysisClient().getView(view, f),
        f.period,
        f,
      );
      return s.status === "ok"
        ? { status: "ok", data: orderView(view, hideAllWhenFew<V>(s.data)) }
        : s;
    },
    enabled: filters !== null,
    ...ANALYSIS_RETRY,
  });
}

/**
 * What a view frame shows: the reply, still loading, waiting to reconnect,
 * or a refusal that means something to the person (switched off, still
 * being prepared, too many new views, a period or filters that can't be
 * used).
 */
export type FrameState<T> =
  | ViewState<T>
  | { status: "loading" }
  | { status: "offline" }
  | { status: "problem"; problem: Exclude<Problem, { kind: "failed" }> };

export function frameState<T>(
  q: UseQueryResult<ViewState<T>, unknown>,
): FrameState<T> {
  if (q.data) return q.data;
  if (q.isError) {
    const problem = problemOf(q.error);
    return problem.kind === "failed"
      ? { status: "failed" }
      : { status: "problem", problem };
  }
  if (q.fetchStatus === "paused") return { status: "offline" };
  return { status: "loading" };
}

/**
 * The de-identified patients behind one shown count; null loads nothing.
 * Never kept: the list leaves the cache as soon as nothing shows it. Each
 * list is audited by core and counts against the person's limits, so it
 * is fetched once per opening and never on focus or reconnect; a refusal
 * (4xx: gone, a limit reached, switched off) is never retried.
 */
export const usePatients = (q: PatientsQuery | null) =>
  useQuery({
    queryKey: ANALYSIS_KEYS.patients(q),
    queryFn: async () => {
      const { drill, level, filters, cell } = q!;
      return readPatients(
        await getAnalysisClient().listPatients({ drill, level, filters }),
        "deidentified",
        Date.now(),
        cell,
      );
    },
    enabled: q !== null,
    gcTime: 0,
    // Fetched once per opening: a refetch would log a second viewing.
    staleTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    ...READ_RETRY,
  });

/** While names are on screen, `clearance/me` is asked this often. */
export const CLEARANCE_POLL_MS = 30_000;

/**
 * The hospital's effective named-access switch, for Analysis. Asks nothing
 * for someone without named access (and Off when the key is off).
 */
export function useNamedAccessPosition() {
  const user = useOptionalAuth()?.user ?? null;
  return useQuery({
    queryKey: ANALYSIS_KEYS.position,
    queryFn: () => getAnalysisClient().getNamedAccess(),
    enabled: canUseNamedAccess(user),
    ...READ_RETRY,
  });
}

/** True only when the switch reads On for someone who may use named access. */
export function useNamedAccessOn(): boolean {
  const user = useOptionalAuth()?.user ?? null;
  const position = useNamedAccessPosition();
  return canUseNamedAccess(user) && position.data?.position === "on";
}

/**
 * Whether this person may see names right now, read and checked (null when
 * it can't be read, which ends names). Asked only while the switch is On;
 * never kept. With `poll`, asked again every 30 seconds, in a hidden tab too.
 */
export function useClearanceMe({ poll }: { poll: boolean }) {
  const on = useNamedAccessOn();
  return useQuery({
    queryKey: ANALYSIS_KEYS.me,
    queryFn: async () =>
      readClearanceMe(await getAnalysisClient().getClearanceMe()),
    enabled: on,
    refetchInterval: poll ? CLEARANCE_POLL_MS : false,
    // A revoke ends names in a hidden tab too.
    refetchIntervalInBackground: poll,
    gcTime: 0,
    ...READ_RETRY,
  });
}

/**
 * The named patients for one view; null loads nothing. A POST with the
 * purpose in the body. Never kept (`gcTime: 0`), never retried (a refusal
 * ends names at once), and fetched once per view.
 */
export const useNamedPatients = (q: NamedQuery | null) =>
  useQuery({
    queryKey: ANALYSIS_KEYS.named(q),
    queryFn: async () => {
      const { idempotencyKey, drill, purpose, note, filters } = q!;
      return readPatients(
        await getAnalysisClient().listNamedPatients(
          { drill, purpose, ...(note ? { note } : {}), filters },
          { idempotencyKey },
        ),
        "named",
        Date.now(),
      );
    },
    enabled: q !== null,
    gcTime: 0,
    retry: false,
    staleTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
