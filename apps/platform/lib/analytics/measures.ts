// The analytics measures in plain words, and their values under the
// small-group rule (spec §5). Display only: the server computes every number.
import { FEWER_THAN_5, isSmallCount } from "@mhai/ui/small-groups";
import type { Area, Guarded, MeasureId } from "../api/analytics-contract";

/**
 * How a value reads. "rate" is a ratio of counts (questions per active
 * clinician): a plain number, never treated as a count of people.
 */
export type MeasureKind = "count" | "rate" | "minutes" | "share" | "hours";

export const NO_DATA = "No data yet";

const LABEL: Record<MeasureId, string> = {
  questions_per_clinician: "Questions per active clinician",
  questions: "Questions",
  active_clinicians: "Active clinicians",
  critical_median_ack_minutes: "Critical median time to acknowledge",
  critical_within_target: "Critical within target",
  unhandled_alerts: "Unhandled alerts",
  alerts_total: "Alerts",
  needs_review_share: "Answers needing review",
  agreement_rate: "Agreement on reviews",
  median_review_hours: "Median review time",
};
export const measureLabel = (m: MeasureId) => LABEL[m];

export const MEASURE_KIND: Record<MeasureId, MeasureKind> = {
  questions_per_clinician: "rate",
  questions: "count",
  active_clinicians: "count",
  critical_median_ack_minutes: "minutes",
  critical_within_target: "share",
  unhandled_alerts: "count",
  alerts_total: "count",
  needs_review_share: "share",
  agreement_rate: "share",
  median_review_hours: "hours",
};

/** The tab each measure belongs to. */
export const MEASURE_AREA: Record<MeasureId, Area> = {
  questions_per_clinician: "use",
  questions: "use",
  active_clinicians: "use",
  critical_median_ack_minutes: "alerts",
  critical_within_target: "alerts",
  unhandled_alerts: "alerts",
  alerts_total: "alerts",
  needs_review_share: "quality",
  agreement_rate: "quality",
  median_review_hours: "quality",
};

/** Where a fall is the good way (times, review load, unhandled alerts). */
export const LOWER_IS_BETTER: ReadonlySet<MeasureId> = new Set<MeasureId>([
  "critical_median_ack_minutes",
  "unhandled_alerts",
  "needs_review_share",
  "median_review_hours",
]);

/** The Hospitals tab's measure picker, in order (spec §4). */
export const COMPARE_MEASURES: MeasureId[] = [
  "questions_per_clinician",
  "critical_median_ack_minutes",
  "critical_within_target",
  "needs_review_share",
];

/** "1,234": grouped the same in every locale. */
export const countText = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "18 min", "1 h 5 min", "2 h": whole minutes. */
export function minutesText(m: number): string {
  const min = Math.round(m);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "3.5 h", "14 h". */
export const hoursText = (h: number) =>
  `${(Math.round(h * 10) / 10).toFixed(1).replace(/\.0$/, "")} h`;

/** "62%" from a share of 0 to 1. */
export const shareText = (s: number) => `${Math.round(s * 100)}%`;

const rateText = (r: number) =>
  (Math.round(r * 10) / 10).toFixed(1).replace(/\.0$/, "");

/** Hidden reads "Fewer than 5"; a count of 1–4 does too, whatever was sent. */
export const isHidden = (g: Guarded, kind: MeasureKind) =>
  g.suppressed ||
  (kind === "count" && g.value !== null && isSmallCount(g.value));

export function valueText(g: Guarded, kind: MeasureKind): string {
  if (isHidden(g, kind)) return FEWER_THAN_5;
  if (g.value === null || !Number.isFinite(g.value)) return NO_DATA;
  switch (kind) {
    case "count":
      return countText(g.value);
    case "minutes":
      return minutesText(g.value);
    case "share":
      return shareText(g.value);
    case "hours":
      return hoursText(g.value);
    case "rate":
      return rateText(g.value);
  }
}

export const measureText = (m: MeasureId, g: Guarded) =>
  valueText(g, MEASURE_KIND[m]);
