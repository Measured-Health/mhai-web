// The Analysis filters: one finished period, at most two other filters, the
// condition search and the Source rule. The filters live in React state
// only (spec §6). Only fixed calendar periods are offered (R41a): finished
// weeks, months and quarters that core lists as answerable, never a custom
// range and never several periods at once.
import type {
  AnalysisFilters,
  ConditionRef,
  FilterOptionsOut,
  PeriodLevel,
  PeriodRef,
} from "../api/analysis-contract";
import { conditionName } from "./labels";

/** The answerable periods' first days, per level, oldest first. */
export type Periods = FilterOptionsOut["periods"];

/** The most filters besides the period (core's `FilterCap`). */
export const FILTER_CAP = 2;
export const CAP_REASON =
  "Up to two filters at a time. Clear one to choose another.";
export const LOCATION_OR_SETTING =
  "Choose a ward or clinic, or a location type, not both.";

const COUNTED = [
  "condition",
  "age_band",
  "sex",
  "location",
  "setting",
  "specialty",
  "source",
] as const satisfies readonly (keyof AnalysisFilters)[];
export type FilterKey = (typeof COUNTED)[number];

/** One period, nothing else filtered. */
export const emptyFilters = (period: PeriodRef): AnalysisFilters => ({
  period,
  condition: null,
  age_band: null,
  sex: null,
  location: null,
  setting: null,
  specialty: null,
  source: null,
});

/** Filters in use, not counting the period: "Filters (2)". */
export const activeCount = (f: AnalysisFilters) =>
  COUNTED.filter((k) => f[k] !== null).length;

/**
 * Why `key` can't be set now, or null. A filter already set can always be
 * changed or cleared; a third one can't be added, and a ward or clinic
 * can't go with a location type (core refuses both).
 */
export function filterBlocked(
  f: AnalysisFilters,
  key: FilterKey,
): string | null {
  if (f[key] !== null) return null;
  if (activeCount(f) >= FILTER_CAP) return CAP_REASON;
  if (key === "setting" && f.location !== null) return LOCATION_OR_SETTING;
  if (key === "location" && f.setting !== null) return LOCATION_OR_SETTING;
  return null;
}

/**
 * The filters with any condition, ward or clinic, specialty or source the
 * period's lists don't have taken out: core refuses an id a period doesn't
 * list (a condition with fewer than 5 patients there).
 */
export function pruneFilters(
  f: AnalysisFilters,
  o: FilterOptionsOut,
): AnalysisFilters {
  const has = <T>(list: T[], ok: (x: T) => boolean) => list.some(ok);
  return {
    ...f,
    condition:
      f.condition !== null && has(o.conditions, (c) => c.id === f.condition)
        ? f.condition
        : null,
    location:
      f.location !== null && has(o.locations, (l) => l.id === f.location)
        ? f.location
        : null,
    specialty:
      f.specialty !== null && o.specialties.includes(f.specialty)
        ? f.specialty
        : null,
    source:
      f.source !== null && has(o.sources, (s) => s.id === f.source)
        ? f.source
        : null,
  };
}

/** A level's answerable periods, newest first (as the picker lists them). */
export const periodsOf = (periods: Periods, level: PeriodLevel): PeriodRef[] =>
  [...periods[level]].reverse().map((start) => ({ level, start }));

/** The latest finished month, else the latest week, else quarter; null when none is ready. */
export function defaultPeriod(periods: Periods): PeriodRef | null {
  for (const level of ["month", "week", "quarter"] as const) {
    const list = periods[level];
    if (list.length > 0) return { level, start: list[list.length - 1] };
  }
  return null;
}

/** The levels that have at least one answerable period. */
export const levelsOf = (periods: Periods): PeriodLevel[] =>
  (["week", "month", "quarter"] as const).filter((l) => periods[l].length > 0);

/** The name or the ICD-10 code, any case. An empty search matches all. */
export function matchCondition(c: ConditionRef, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (s === "") return true;
  return (
    conditionName(c).toLowerCase().includes(s) ||
    (c.icd10?.toLowerCase().includes(s) ?? false)
  );
}

/** The Source filter shows only with more than one source (ADR 0003). */
export const showSource = (o: FilterOptionsOut) => o.sources.length > 1;
