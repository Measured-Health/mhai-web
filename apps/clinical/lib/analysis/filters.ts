// The Analysis filters: the periods, the custom range, the condition search
// and the Source rule. The filters live in React state only (spec §6).
import type {
  AnalysisFilters,
  ConditionRef,
  FilterOptionsOut,
} from "../api/analysis-contract";
import { conditionName } from "./labels";
import { isDay } from "./read";

export type PeriodId = "30d" | "90d" | "12m" | "custom";
export type PresetId = Exclude<PeriodId, "custom">;

export const PERIODS: readonly { id: PeriodId; label: string }[] = [
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "12m", label: "Last 12 months" },
  { id: "custom", label: "Custom" },
];
export const DEFAULT_PERIOD: PresetId = "90d";
/** The longest custom range, in months. */
export const RANGE_MAX_MONTHS = 24;

const DAY_MS = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const minusDays = (d: string, n: number) => iso(parse(d) - n * DAY_MS);

/** `d` plus `n` months, the same day or the month's last (29 Feb + 12 months is 28 Feb). */
function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return iso(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last)),
  );
}

/** A preset's range: ending `today`, from 30 or 90 days, or 12 months, before. */
export function rangeFor(
  preset: PresetId,
  today: string,
): { from: string; to: string } {
  const from =
    preset === "30d"
      ? minusDays(today, 30)
      : preset === "90d"
        ? minusDays(today, 90)
        : addMonths(today, -12);
  return { from, to: today };
}

/** The last 90 days, nothing else filtered. */
export function defaultFilters(today: string): AnalysisFilters {
  return {
    ...rangeFor(DEFAULT_PERIOD, today),
    condition: null,
    age_band: null,
    sex: null,
    location: null,
    setting: null,
    specialty: null,
    source: null,
  };
}

/** Why a custom range can't be used, or null. */
export function customRangeProblem(from: string, to: string): string | null {
  if (!from || !to) return "Enter both dates";
  if (!isDay(from) || !isDay(to)) return "Enter real dates";
  if (from > to) return "The start date must be on or before the end date";
  if (addMonths(from, RANGE_MAX_MONTHS) < to)
    return `Choose a range of ${RANGE_MAX_MONTHS} months or less`;
  return null;
}

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

const COUNTED = [
  "condition",
  "age_band",
  "sex",
  "location",
  "setting",
  "specialty",
  "source",
] as const satisfies readonly (keyof AnalysisFilters)[];

/** Filters in use, not counting the dates: "Filters (3)". */
export const activeCount = (f: AnalysisFilters) =>
  COUNTED.filter((k) => f[k] !== null).length;
