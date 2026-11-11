// The analytics part of the platform API: core openapi.yaml 1.15.0
// (backend Plan 7c spec §7, §9, §13).
// Counts only: nothing here names a patient or a member of staff at a
// hospital, and every count is guarded by the small-group rule (§5).
import type { Person } from "./contract";

/**
 * The kind of finished calendar period the charts, the tabs and the CSV
 * cover (R41a): the latest finished week (month-aligned), month or quarter.
 */
export type Period = "week" | "month" | "quarter";
export const PERIODS: readonly Period[] = ["week", "month", "quarter"];
export const DEFAULT_PERIOD: Period = "month";

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
  /**
   * Whether the signed-in person wrote it, set by the server per caller:
   * only the author may edit the note.
   */
  by_you: boolean;
  /** Moves on each time the follow-up itself changes (a note edit). */
  version: number;
};

/**
 * Something that changed: the latest week against the month that finished
 * before it, per day. It keeps its `id` while each weekly evaluation flags it
 * again. Core sends only area `use` or `quality`, measure `questions`,
 * `needs_review_share` or `agreement_rate`, both sides shown, and `serious`
 * false (no patient alerts yet).
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
/** Before the first published period of the kind (F19). */
export type NotYet = { not_yet: true; first_from: string };

/** The measures core flags changes on. */
export const CHANGE_MEASURES: readonly MeasureId[] = [
  "questions",
  "needs_review_share",
  "agreement_rate",
];
/** The hospital series' measures until patient alerts exist (F10). */
export const SERIES_MEASURES: readonly MeasureId[] = [
  "questions_per_clinician",
  "needs_review_share",
];

export type HospitalSize = {
  /** Guarded until the privacy lead decides (backend spec Q4). */
  staff: Guarded;
  active_clinicians: Guarded;
  questions: Guarded;
};
export type UseRow = {
  hospital: Person;
  questions: Guarded;
  active_clinicians: Guarded;
  questions_per_clinician: Guarded;
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

export type ChangesOut = {
  updated_at: string;
  /** From the compared month's start to the latest week's end. */
  window: { from: string; to: string };
  items: Change[];
};

export type AnalyticsOut = {
  period: Period;
  /** The latest published period, [from, to); null before the first. */
  from: string | null;
  to: string | null;
  /** Always unavailable: What changed is `what_changed` (F21). */
  changes: Unavailable;
  use: AreaBlock<UseRow> | Unavailable | NotYet;
  /** Always null: not switched on until patient alerts exist (F4). */
  alerts: null;
  quality: AreaBlock<QualityRow> | Unavailable | NotYet;
  hospitals:
    | { updated_at: string; rows: { hospital: Person; size: HospitalSize }[] }
    | Unavailable
    | NotYet;
  /** The same for every period: the newest weekly evaluation. */
  what_changed: ChangesOut | Unavailable;
};

/**
 * One measure for each of the latest periods (12 weeks, 12 months or 8
 * quarters), oldest first. A change's series carries `change_id`;
 * `hospital` is null for a change across all hospitals (no median).
 */
export type SeriesOut = {
  change_id?: string;
  measure: MeasureId;
  hospital: Person | null;
  points: { start: string; value: Guarded; median: number | null }[];
};

/** Guardrail (HGA) statistics of one row: answers and their decisions. */
export type GuardrailRates = {
  answers: Guarded;
  pass: Guarded;
  regenerate: Guarded;
  escalate: Guarded;
  degraded: Guarded;
  pass_share: Guarded;
  regenerate_share: Guarded;
  escalate_share: Guarded;
};
/** `GET /platform/guardrails/periods` (F20). */
export type GuardrailPeriodsOut = {
  period: Period;
  from: string;
  to: string;
  updated_at: string;
  all: GuardrailRates;
  hospitals: (GuardrailRates & { hospital: Person })[];
};
