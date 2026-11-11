// The reporting calendar (backend spec §4; rulings R41a, R41a-2), in UTC.
// A period is (kind, start), covering [start, end):
//   week: a month-aligned block, days 1–7, 8–14, 15–21, 22 to the month's end;
//   month: a calendar month; quarter: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec.
// Weeks nest in months and months in quarters. Labels only: the app never
// adds periods together.
import type { Period } from "../api/analytics-contract";

const DAY = 86_400_000;
const WEEK_STARTS = [1, 8, 15, 22];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The picker's words. */
export const PERIOD_PICK: Record<Period, string> = {
  week: "Last week",
  month: "Last month",
  quarter: "Last quarter",
};
const KIND_WORD: Record<Period, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

const utc = (y: number, m: number, d = 1) => Date.UTC(y, m, d);

/** Whether `iso` is the very start (midnight UTC) of a period of `kind`. */
export function isPeriodStart(kind: Period, iso: unknown): boolean {
  if (typeof iso !== "string") return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t) || t % DAY !== 0) return false;
  const d = new Date(t);
  const day = d.getUTCDate();
  if (kind === "week") return WEEK_STARTS.includes(day);
  if (kind === "month") return day === 1;
  return day === 1 && d.getUTCMonth() % 3 === 0;
}

/** The end (exclusive, ms) of the period of `kind` starting at `start` (ms). */
export function periodEnd(kind: Period, start: number): number {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (kind === "month") return utc(y, m + 1);
  if (kind === "quarter") return utc(y, m + 3);
  const day = d.getUTCDate();
  return day === 22 ? utc(y, m + 1) : utc(y, m, day + 7);
}

/** The start (ms) of the period of `kind` that contains `t` (ms). */
export function periodOf(kind: Period, t: number): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (kind === "month") return utc(y, m);
  if (kind === "quarter") return utc(y, m - (m % 3));
  const day = d.getUTCDate();
  return utc(y, m, WEEK_STARTS.filter((s) => s <= day).at(-1)!);
}

/**
 * The latest `n` finished periods of `kind` at `now` (ms), oldest first,
 * as [start, end) pairs.
 */
export function finishedPeriods(
  kind: Period,
  now: number,
  n: number,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  // The period containing now isn't finished; step back from its start.
  let to = periodOf(kind, now);
  while (out.length < n) {
    const from = periodOf(kind, to - 1);
    out.unshift({ from, to });
    to = from;
  }
  return out;
}

function parts(kind: Period, iso: string) {
  const from = Date.parse(iso);
  const a = new Date(from);
  const b = new Date(periodEnd(kind, from) - DAY);
  return { a, b };
}

/** "22–31 Oct 2026", "1–31 Oct 2026", "1 Jul–30 Sep 2026". */
export function periodRange(kind: Period, iso: string): string {
  const { a, b } = parts(kind, iso);
  const y = b.getUTCFullYear();
  if (a.getUTCMonth() === b.getUTCMonth())
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${y}`;
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${y}`;
}

/** A column's label: "22–31 Oct" for a week, "Oct 2026", "Jul–Sep 2026". */
export function periodShort(kind: Period, iso: string): string {
  const { a, b } = parts(kind, iso);
  if (kind === "week")
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  if (kind === "month")
    return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  return `${MONTHS[a.getUTCMonth()]}–${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** "Month 1–31 Oct 2026": a period named by its dates (the CSV). */
export const periodLabel = (kind: Period, iso: string) =>
  `${KIND_WORD[kind]} ${periodRange(kind, iso)}`;

/** "First figures after 1–31 Dec 2026" (F19). */
export const firstFiguresText = (kind: Period, firstFrom: string) =>
  `First figures after ${periodRange(kind, firstFrom)}`;

/**
 * What changed's window (the compared month's start to the latest week's
 * end) in words: "Week 1–7 Nov 2026 against Month 1–31 Oct 2026, per day".
 */
export function windowText(w: { from: string; to: string }): string {
  const week = new Date(periodOf("week", Date.parse(w.to) - 1)).toISOString();
  return `${periodLabel("week", week)} against ${periodLabel("month", w.from)}, per day`;
}

/** A window's two ends are a month start and the end of a week after it. */
export function windowOk(w: { from: string; to: string }): boolean {
  if (!isPeriodStart("month", w.from)) return false;
  const to = Date.parse(w.to);
  if (Number.isNaN(to) || to % DAY !== 0) return false;
  const week = periodOf("week", to - 1);
  return (
    periodEnd("week", week) === to &&
    week >= periodEnd("month", Date.parse(w.from))
  );
}
