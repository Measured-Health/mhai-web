// The platform Analysis filters (spec §4.1, §4.2): three fixed periods, the
// filters each scope allows, the limit of 3 across hospitals and 4 for one,
// and switching scope, which clears every filter. Filters, scope, hospital,
// period and view live in React state only: never the URL, browser
// storage, the title or logs.
import {
  MAX_FILTERS,
  analysisQueryParams,
  type AllAgeBand,
  type AnalysisPeriod,
  type AnalysisQuery,
  type ConditionRef,
  type FilterKey,
  type FilterOptionsOut,
  type HospitalAgeBand,
  type ScopeKind,
} from "../api/analysis-contract";
import { conditionText } from "./labels";

export { analysisQueryParams };

export const PERIODS: AnalysisPeriod[] = ["3m", "6m", "12m"];
export const DEFAULT_PERIOD: AnalysisPeriod = "12m";
export const FILTER_LIMIT: Record<ScopeKind, number> = { ...MAX_FILTERS };

export const AGE_BANDS: Record<
  ScopeKind,
  readonly (AllAgeBand | HospitalAgeBand)[]
> = {
  all: ["0-19", "20-39", "40-59", "60-79", "80+"],
  hospital: ["0-17", "18-39", "40-64", "65-79", "80+"],
};

/** Across hospitals: never ward or clinic, never source. */
export const ALLOWED: Record<ScopeKind, readonly FilterKey[]> = {
  all: ["condition", "age_band", "sex", "setting", "specialty"],
  hospital: [
    "condition",
    "age_band",
    "sex",
    "setting",
    "specialty",
    "location",
    "source",
  ],
};
const KEYS = ALLOWED.hospital;

/** Nothing filtered; Last 12 months unless a period is given. */
export function emptyQuery(
  scope: ScopeKind,
  hospital: string | null,
  period: AnalysisPeriod = DEFAULT_PERIOD,
): AnalysisQuery {
  if (scope === "hospital" && hospital === null)
    throw new Error("one hospital needs a hospital");
  return {
    scope,
    hospital: scope === "all" ? null : hospital,
    period,
    condition: null,
    age_band: null,
    sex: null,
    setting: null,
    specialty: null,
    location: null,
    source: null,
  };
}

/** Filters in use: "Filters (3)". The period isn't one. */
export const activeCount = (q: AnalysisQuery) =>
  KEYS.filter((k) => q[k] !== null).length;
export const atLimit = (q: AnalysisQuery) =>
  activeCount(q) >= FILTER_LIMIT[q.scope];

/**
 * Sets one filter, or clears it with null. Throws on a filter the scope
 * doesn't allow, an age band of the other scope, or a new filter past the
 * limit (changing or clearing one at the limit is fine). The Source filter
 * is offered only where `showSource` says so; the server refuses a source
 * for a hospital with one.
 */
export function setFilter(
  q: AnalysisQuery,
  key: FilterKey,
  value: string | null,
): AnalysisQuery {
  if (!ALLOWED[q.scope].includes(key))
    throw new Error(`${key} isn't a filter in this scope`);
  if (value === null) return { ...q, [key]: null };
  if (
    key === "age_band" &&
    !(AGE_BANDS[q.scope] as readonly string[]).includes(value)
  )
    throw new Error("not an age band in this scope");
  if (q[key] === null && atLimit(q)) throw new Error("too many filters");
  return { ...q, [key]: value };
}

/**
 * A new scope or hospital starts with no filters (each scope has its own
 * bands, and a ward or source belongs to one hospital), keeping the period.
 * `cleared` says whether any filter went, for "Filters cleared for the new
 * scope".
 */
export function switchScope(
  q: AnalysisQuery,
  scope: ScopeKind,
  hospital: string | null,
): { query: AnalysisQuery; cleared: boolean } {
  const query = emptyQuery(scope, hospital, q.period);
  if (query.scope === q.scope && query.hospital === q.hospital)
    return { query: q, cleared: false };
  return { query, cleared: activeCount(q) > 0 };
}

export function limitText(scope: ScopeKind): string {
  const where = scope === "all" ? "across all hospitals" : "for one hospital";
  return `Up to ${FILTER_LIMIT[scope]} filters at a time ${where}. Remove one to add another.`;
}

/** The name or the ICD-10 code, any case. An empty search matches all. */
export function matchCondition(c: ConditionRef, s: string): boolean {
  const q = s.trim().toLowerCase();
  if (q === "") return true;
  return (
    conditionText(c).toLowerCase().includes(q) ||
    (c.icd10?.toLowerCase().includes(q) ?? false)
  );
}

/** The Source filter shows only for a hospital with more than one source. */
export const showSource = (o: FilterOptionsOut) => o.sources.length > 1;
