// The audit log's date ranges: whole local days, sent as the local-midnight
// instants [from, to + 1 day).

export type Preset = "today" | "7d" | "30d" | "12m" | "custom";
export const DEFAULT_PRESET: Preset = "30d";

export const FROM_AFTER_TO = "Choose a From date on or before the To date.";
export const TO_IN_FUTURE = "The To date can't be in the future.";
export const CHOOSE_DATES = "Choose a From date and a To date.";

type Range = { from: string; to: string };

/** Today's preset ranges, ending at the next local midnight. */
export function rangeOf(p: Exclude<Preset, "custom">, now: number): Range {
  const n = new Date(now);
  const [y, m, d] = [n.getFullYear(), n.getMonth(), n.getDate()];
  const from =
    p === "today"
      ? new Date(y, m, d)
      : p === "7d"
        ? new Date(y, m, d - 6)
        : p === "30d"
          ? new Date(y, m, d - 29)
          : new Date(y - 1, m, d + 1);
  return { from: from.toISOString(), to: new Date(y, m, d + 1).toISOString() };
}

/** A "YYYY-MM-DD" day as its local midnight, or null if it isn't a day. */
function day(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const t = new Date(y, mo, d);
  return t.getFullYear() === y && t.getMonth() === mo && t.getDate() === d
    ? t
    : null;
}

/** A custom range of whole local days, or why it can't be used. */
export function checkCustomRange(
  fromDay: string,
  toDay: string,
  now: number,
): Range | { error: string } {
  const from = day(fromDay);
  const to = day(toDay);
  if (!from || !to) return { error: CHOOSE_DATES };
  if (from > to) return { error: FROM_AFTER_TO };
  const n = new Date(now);
  if (to > new Date(n.getFullYear(), n.getMonth(), n.getDate()))
    return { error: TO_IN_FUTURE };
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  return { from: from.toISOString(), to: end.toISOString() };
}
