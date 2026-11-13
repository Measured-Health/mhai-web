// Analysis periods (core 1.17.0; privacy ruling R41a): only finished, fixed
// calendar periods. A week is a month-aligned block (days 1–7, 8–14, 15–21,
// or 22 to the month's end), a month a calendar month, a quarter three
// months from January, April, July or October. A request names exactly one
// period by its level and first day; there are no custom ranges, and
// nothing here adds periods together.
import type { PeriodLevel, PeriodRef } from "../api/analysis-contract";

export const PERIOD_LEVELS: readonly PeriodLevel[] = [
  "week",
  "month",
  "quarter",
];
export const LEVEL_LABEL: Record<PeriodLevel, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

const WEEK_STARTS = [1, 8, 15, 22];
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** The last day of month `m` (1–12). */
const monthEnd = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** [year, month 1–12, day] of a real "YYYY-MM-DD", or null. */
function parts(day: string): [number, number, number] | null {
  const m = DAY.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > monthEnd(y, mo)) return null;
  return [y, mo, d];
}

/** Whether `start` is the first day of a period of `level`. */
export function isPeriodStart(level: PeriodLevel, start: string): boolean {
  const p = parts(start);
  if (!p) return false;
  const [, m, d] = p;
  if (level === "week") return WEEK_STARTS.includes(d);
  if (level === "month") return d === 1;
  return d === 1 && (m - 1) % 3 === 0;
}

export const isPeriodRef = (v: {
  level: string;
  start: string;
}): v is PeriodRef =>
  (PERIOD_LEVELS as readonly string[]).includes(v.level) &&
  isPeriodStart(v.level as PeriodLevel, v.start);

/** The period's first and last days, both inclusive. */
export function periodSpan(p: PeriodRef): { from: string; to: string } {
  const [y, m, d] = parts(p.start)!;
  if (p.level === "week")
    return {
      from: p.start,
      to: ymd(y, m, d === 22 ? monthEnd(y, m) : d + 6),
    };
  if (p.level === "month")
    return { from: p.start, to: ymd(y, m, monthEnd(y, m)) };
  const last = m + 2;
  return { from: p.start, to: ymd(y, last, monthEnd(y, last)) };
}

/** The period of `level` that holds `day`. */
export function periodOf(level: PeriodLevel, day: string): PeriodRef {
  const [y, m, d] = parts(day)!;
  if (level === "week") {
    const s = d >= 22 ? 22 : d >= 15 ? 15 : d >= 8 ? 8 : 1;
    return { level, start: ymd(y, m, s) };
  }
  if (level === "month") return { level, start: ymd(y, m, 1) };
  return { level, start: ymd(y, m - ((m - 1) % 3), 1) };
}

/** The day after `day`. */
function nextDay(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
/** The day before `day`. */
function prevDay(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The period after `p`, of the same level. */
export const nextPeriod = (p: PeriodRef): PeriodRef => ({
  level: p.level,
  start: nextDay(periodSpan(p).to),
});
/** The period before `p`, of the same level. */
export const prevPeriod = (p: PeriodRef): PeriodRef =>
  periodOf(p.level, prevDay(p.start));

/**
 * Every period of `level` lying wholly within [first, last], oldest first:
 * what the demo offers as its frozen periods.
 */
export function periodsWithin(
  level: PeriodLevel,
  first: string,
  last: string,
): PeriodRef[] {
  let p = periodOf(level, first);
  if (p.start < first) p = nextPeriod(p);
  const out: PeriodRef[] = [];
  while (periodSpan(p).to <= last) {
    out.push(p);
    p = nextPeriod(p);
  }
  return out;
}

// Fixed words, not the runtime's: some give "Sept", some "Sep".
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const short = (m: number) => MONTHS[m - 1].slice(0, 3);

/** "1–7 Oct 2026", "October 2026", or "Jul–Sep 2026". */
export function periodLabel(p: PeriodRef): string {
  const { from, to } = periodSpan(p);
  const [y, m1, d1] = parts(from)!;
  const [, m2, d2] = parts(to)!;
  if (p.level === "week") return `${d1}–${d2} ${short(m1)} ${y}`;
  if (p.level === "month") return `${MONTHS[m1 - 1]} ${y}`;
  return `${short(m1)}–${short(m2)} ${y}`;
}

export const samePeriod = (a: PeriodRef | null, b: PeriodRef | null) =>
  a !== null && b !== null && a.level === b.level && a.start === b.start;
