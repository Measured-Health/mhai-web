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

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/** "09:41" today; "12 Sep 09:41" before; "" when unreadable. */
export function eventClock(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay ? CLOCK.format(d) : `${DATE.format(d)} ${CLOCK.format(d)}`;
}
