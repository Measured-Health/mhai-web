// How long records are kept, in words and choices (spec §9, Plan 8c).

const MONTH = 30;
const YEAR = 365;

/** "6 years", "6 months" or "45 days": years for whole years, then months. */
export function daysLabel(days: number): string {
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (days > 0 && days % YEAR === 0) return n(days / YEAR, "year");
  if (days > 0 && days % MONTH === 0) return n(days / MONTH, "month");
  return n(days, "day");
}

/** 1–11 months, then 1–10 years. */
const PERIODS: readonly number[] = [
  ...Array.from({ length: 11 }, (_, i) => (i + 1) * MONTH),
  ...Array.from({ length: 10 }, (_, i) => (i + 1) * YEAR),
];

/**
 * The periods offered for a type, shortest first: never below its minimum,
 * and always the period in force (even one that isn't a whole month or year).
 * If the period in force is below the minimum it is listed too; choosing it
 * is refused in the dialog ("Choose a different period."), so it is harmless.
 */
export function periodOptions(minimum_days: number, current: number): number[] {
  const set = new Set(PERIODS.filter((d) => d >= minimum_days));
  set.add(current);
  return [...set].sort((a, b) => a - b);
}

/** What a shorter period would delete at the next clean-up. */
export const previewLine = (days: number, n: number) =>
  `With ${daysLabel(days)}, about ${n} records would be deleted in the next clean-up. Records under a legal hold are kept.`;

/** A shorter period needs a different platform admin's approval. */
export const isShorter = (days: number, current: number) => days < current;
