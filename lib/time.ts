/** Whole minutes from `fromMs` to `now`, rounded; a clock running ahead gives 0. */
export const minutesBetween = (fromMs: number, now: number) =>
  Math.max(0, Math.round((now - fromMs) / 60_000));

/** "42 min", "3 h". The sidebar's wording: no days. */
export function ago(fromMs: number, now: number): string {
  const m = minutesBetween(fromMs, now);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Like `ago`, but long gaps read in days: "42 min", "3 h", "2 d". */
export function ageLabel(fromMs: number, now: number): string {
  const m = minutesBetween(fromMs, now);
  if (m < 1440) return ago(fromMs, now);
  return `${Math.round(m / 1440)} d`;
}
