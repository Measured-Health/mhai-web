// The analytics part of the platform API (spec §7, assumed backend contract).
// Counts only: nothing here names a patient or a member of staff at a
// hospital, and every count is guarded by the small-group rule (§5).
import type { Person } from "./contract";

/** The period the charts, the tabs and the CSV cover. */
export type Period = "7d" | "30d" | "90d";
export const PERIODS: readonly Period[] = ["7d", "30d", "90d"];

/**
 * A value under the small-group rule: a count of 1–4 comes as
 * `{value: null, suppressed: true}`, and so does anything worked out from
 * one. `{value: null, suppressed: false}` means there is nothing to show
 * (no previous period, or nothing to divide by).
 */
export type Guarded = { value: number | null; suppressed: boolean };

export type Area = "use" | "alerts" | "quality";
export type Direction = "worse" | "better" | "rising" | "falling";
export type MeasureId =
  | "questions_per_clinician"
  | "questions"
  | "active_clinicians"
  | "critical_median_ack_minutes"
  | "critical_within_target"
  | "unhandled_alerts"
  | "alerts_total"
  | "needs_review_share"
  | "agreement_rate"
  | "median_review_hours";
export const MEASURES: readonly MeasureId[] = [
  "questions_per_clinician",
  "questions",
  "active_clinicians",
  "critical_median_ack_minutes",
  "critical_within_target",
  "unhandled_alerts",
  "alerts_total",
  "needs_review_share",
  "agreement_rate",
  "median_review_hours",
];

export type FollowUp = {
  by: Person;
  at: string;
  note: string | null;
  /** Moves on each time the follow-up itself changes (a note edit). */
  version: number;
};

/**
 * Something that changed in the fixed window (the last 7 days against the 4
 * weeks before). It keeps its `id` for as long as the condition lasts.
 */
export type Change = {
  id: string;
  /** Null for a change across all hospitals. */
  hospital: Person | null;
  area: Area;
  measure: MeasureId;
  direction: Direction;
  /** Critical-type: Critical handling or unhandled Critical alerts. */
  serious: boolean;
  previous: Guarded;
  current: Guarded;
  /** Plain words, from the server. */
  summary: string;
  follow_up: FollowUp | null;
  /** Moves on with every follow-up write; sent back on the next one. */
  version: number;
};

export type Unavailable = { unavailable: true };

export type HospitalSize = {
  staff: number;
  active_clinicians: Guarded;
  questions: Guarded;
};
export type UseRow = {
  hospital: Person;
  questions: Guarded;
  active_clinicians: Guarded;
  questions_per_clinician: Guarded;
};
export type AlertsRow = {
  hospital: Person;
  by_severity: Record<"critical" | "urgent" | "info", Guarded>;
  total: Guarded;
  unhandled: Guarded;
  median_ack_minutes: Guarded;
  critical_median_ack_minutes: Guarded;
  /** A share from 0 to 1. */
  critical_within_target: Guarded;
  critical_target_minutes: number;
  /** Unhandled Critical alerts past the target, now. */
  critical_overdue: Guarded;
};
export type QualityRow = {
  hospital: Person;
  answers: Guarded;
  /** Answers a reviewer looked at: what `agreement_rate` is over. */
  reviews: Guarded;
  /** A share from 0 to 1. */
  needs_review_share: Guarded;
  confidence: Record<"high" | "medium" | "low", Guarded>;
  /** A share from 0 to 1. */
  agreement_rate: Guarded;
  median_review_hours: Guarded;
};
export type AreaBlock<R> = {
  updated_at: string;
  rows: R[];
  /** The all-hospitals median, under the same rules as a row. */
  median: Omit<R, "hospital">;
  /** Across all hospitals, under the same rule: a count of 1–4 is hidden. */
  trend: { start: string; value: Guarded }[];
};

export type AnalyticsOut = {
  period: Period;
  from: string;
  to: string;
  changes:
    | {
        updated_at: string;
        window: { from: string; to: string };
        items: Change[];
      }
    | Unavailable;
  use: AreaBlock<UseRow> | Unavailable;
  alerts: AreaBlock<AlertsRow> | Unavailable;
  quality: AreaBlock<QualityRow> | Unavailable;
  hospitals:
    | { updated_at: string; rows: { hospital: Person; size: HospitalSize }[] }
    | Unavailable;
};

export type SeriesOut = {
  measure: MeasureId;
  hospital: Person;
  points: { start: string; value: Guarded; median: number | null }[];
};
