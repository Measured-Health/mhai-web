/** Fixed English month names: the same everywhere, never "Sept". */
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
] as const;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "3 Mar 2031". A timestamp shows the viewer's local date; a date-only
 * value ("2031-03-03") is shown exactly as given, never shifted a day.
 */
export function dateLabel(value: string) {
  const d = DATE_ONLY.exec(value);
  if (d) return `${Number(d[3])} ${MONTHS[Number(d[2]) - 1]} ${d[1]}`;
  const t = new Date(value);
  return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
}

/** "21 Oct": `dateLabel` without the year (same local-date rule). */
export const dayMonthLabel = (value: string) =>
  dateLabel(value).replace(/ \d{4}$/, "");
