// The hospital admin API, hand-written from Plan 4's assumed contract
// (spec §10 items 2 and 3). To be replaced by types generated from the
// backend OpenAPI schema. Nothing here can carry question text, results or
// patient details: keep it that way. The usage contract carries alert counts
// only, never patients, MRNs, beds or alert ids.

import type {
  AlertLocationOut,
  AlertSeverity,
  DismissReason,
  FindingFlag,
} from "./alerts-contract";

export type StaffRole = "clinician" | "analyst" | "hospital_admin";
export type StaffStatus = "active" | "invited" | "deactivated";
export type SignInMethod = "sso" | "password_mfa" | "password";
export type StaffIssue = "mfa_not_set_up" | "invite_expired";

export interface StaffOut {
  id: string;
  full_name: string;
  display_name: string;
  email: string;
  roles: StaffRole[];
  specialty: string | null;
  can_review: boolean;
  /** Specialties they review in; empty when `can_review` is false. */
  review_specialties: string[];
  status: StaffStatus;
  issues: StaffIssue[];
  sign_in: SignInMethod | null;
  last_active_at: string | null; // ISO 8601
  joined_at: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  /** The signed-in admin's own row (the API decides, R15). */
  is_you: boolean;
  /** Sent back on edits; a stale one gets 409 `conflict` (R7). */
  version: number;
}

export interface InviteIn {
  emails: string[];
  roles: StaffRole[];
  specialty: string | null;
}
export type InviteSkipReason =
  "already_staff" | "domain_not_allowed" | "invalid_email" | "duplicate";
export interface InviteOut {
  invited: StaffOut[];
  skipped: { email: string; reason: InviteSkipReason }[];
}

export interface StaffPatchIn {
  version: number;
  roles?: StaffRole[];
  specialty?: string | null;
  can_review?: boolean;
  review_specialties?: string[];
}

export type SsoStatus = "connected" | "not_set_up" | "error";

export interface HospitalSettingsOut {
  hospital_name: string;
  review_overdue_hours: number;
  reviewers_share_specialty: boolean;
  require_mfa_for_clinicians: boolean;
  idle_timeout_minutes: number;
  allow_trust_device: boolean;
  /** Read-only here: Measured Health configures sign-in. */
  sso: { status: SsoStatus; domain: string | null };
  allowed_email_domains: string[];
  /** The hospital's specialties, for pickers. */
  specialties: string[];
  /** The choices Measured Health allows. */
  limits: { review_overdue_hours: number[]; idle_timeout_minutes: number[] };
  version: number;
}
export type SettingsEditable = Pick<
  HospitalSettingsOut,
  | "review_overdue_hours"
  | "reviewers_share_specialty"
  | "require_mfa_for_clinicians"
  | "idle_timeout_minutes"
  | "allow_trust_device"
>;
export type SettingsPatchIn = Partial<SettingsEditable> & { version: number };

export type UsagePeriod = "this_month" | "last_month" | "last_90_days";
export type ConfidenceLevel = "high" | "caution" | "review" | "failed";

export interface UsageOut {
  period: UsagePeriod;
  from: string;
  to: string;
  consultations: number;
  active_clinicians: number;
  /** 0–1; null when nothing was rated. */
  agreement_rate: number | null;
  median_review_hours: number | null;
  /** Counts per confidence level. */
  confidence: Record<ConfidenceLevel, number>;
  by_specialty: { specialty: string; consultations: number }[];
  /**
   * Patient alerts (Plan 5b, spec §10 item 21). Null or absent: alerts aren't
   * switched on (an older backend sends no field). `{ unavailable: true }`:
   * the rest of usage is fine but the alert numbers couldn't be computed.
   */
  alerts?: UsageAlertsOut | UsageAlertsUnavailableOut | null;
}

/**
 * A number under the small-group rule. A hidden value is
 * `{ value: null, suppressed: true }`; `value: null` with `suppressed: false`
 * means there was nothing to measure.
 */
export interface GuardedOut {
  value: number | null;
  suppressed: boolean;
}

export type ChangeDirection = "up" | "down" | "same";

/** The backend's comparison with the previous period of the same length. */
export interface ChangeOut {
  direction: ChangeDirection;
  /** Whole percent for counts, minutes for times, percentage points for shares. */
  amount: number;
  /** The previous period's value, in the measure's unit (0–1 for shares). Never hidden. */
  previous: number;
}

/** A number with its change. `change` is null when either period is hidden or missing. */
export interface MeasureOut extends GuardedOut {
  change: ChangeOut | null;
}

export interface FindingGroupOut {
  /** Display label, e.g. "Potassium"; null for the unmapped findings ("Not standardised"). */
  name: string | null;
  flag: FindingFlag | null;
  count: GuardedOut;
}

export interface LocationGroupOut {
  /** Ward level at most (`bed` is null). Null reads "Location not recorded". */
  location: AlertLocationOut | null;
  count: GuardedOut;
}

export interface DismissReasonCountOut {
  reason: DismissReason;
  count: GuardedOut;
}

export interface SeriesBucketOut {
  /**
   * The hospital's calendar day, or the week's first day: "YYYY-MM-DD". Weeks
   * start on the period's first day (not a fixed weekday); the last may be partial.
   */
  start: string;
  /** Hospital-wide; not suppressed. */
  total: number;
  /** About how many times the usual level, when flagged as unusual; else null. */
  usual_multiple: number | null;
}

export interface AlertSeriesOut {
  /** Days for this_month and last_month, weeks for last_90_days. */
  bucket: "day" | "week";
  /** Oldest first. */
  points: SeriesBucketOut[];
}

/** A finding or location well up on the previous period: at least 5 in both. */
export type RisingOut =
  | {
      kind: "finding";
      name: string | null;
      flag: FindingFlag | null;
      count: number;
      previous: number;
    }
  | {
      kind: "location";
      location: AlertLocationOut | null;
      count: number;
      previous: number;
    };

/** Critical handled within the target dropped noticeably (shares 0–1). */
export interface WorseningOut {
  value: number;
  previous: number;
}

export interface UsageAlertsOut {
  /** The hospital's target for handling a Critical alert, in minutes (15 by default). */
  critical_target_minutes: number;
  /** False when there's no earlier period of the same length: no changes, no flags. */
  has_previous: boolean;
  total: MeasureOut;
  by_severity: Record<AlertSeverity, MeasureOut>;
  unhandled: MeasureOut;
  /** Minutes from raised to acknowledged; value null when none was acknowledged. */
  median_ack_minutes: MeasureOut;
  median_ack_minutes_critical: MeasureOut;
  /** 0–1: Critical alerts acknowledged or dismissed within the target. */
  critical_within_target: MeasureOut;
  /** 0–1 of handled alerts. */
  acknowledged_share: MeasureOut;
  dismissed_share: MeasureOut;
  /** All four reasons: not_relevant, already_known, wrong_patient, other. */
  dismiss_reasons: DismissReasonCountOut[];
  /** At most 5 each, largest first. */
  top_findings: FindingGroupOut[];
  top_locations: LocationGroupOut[];
  series: AlertSeriesOut;
  rising: RisingOut[];
  worsening: WorseningOut | null;
}

export interface UsageAlertsUnavailableOut {
  unavailable: true;
}

export type ActivityType =
  | "sign_in"
  | "consultation"
  | "feedback"
  | "review"
  | "account"
  | "admin"
  | "security";

export type ActivityKind =
  | "signed_in"
  | "signed_in_without_mfa"
  | "sign_in_locked"
  | "consultation_run"
  | "result_agreed"
  | "correction_suggested"
  | "correction_approved"
  | "correction_rejected"
  | "correction_withdrawn"
  | "invite_sent"
  | "invite_cancelled"
  | "invite_accepted"
  | "roles_changed"
  | "specialty_changed"
  | "reviewer_changed"
  | "deactivated"
  | "reactivated"
  | "removed"
  | "password_reset_sent"
  | "mfa_reset"
  | "mfa_reminder_sent"
  | "settings_changed"
  | "reviewers_reminded"
  | "reviewer_assigned"
  | "policy_breach"
  | "analyst_granted"
  | "analyst_removed"
  | "analysis_patients_viewed"
  /** An admin changed their own roles: allowed, audited, flagged `alert`. */
  | "self_role_change";

/** One audit event. Structured fields only; never free text (R9). */
export interface ActivityEventOut {
  id: string;
  at: string;
  type: ActivityType;
  /** Unknown kinds are tolerated and shown generically. */
  kind: ActivityKind | (string & {});
  /** Null for the system. */
  actor: { display_name: string } | null;
  target: { display_name: string } | null;
  specialty: string | null;
  confidence: ConfidenceLevel | null;
  /** e.g. "Chrome on Windows". */
  device: string | null;
  /** e.g. failed sign-ins before a lock. */
  count: number | null;
  flag: "policy" | "alert" | null;
  /** On a self role change: the roles they gave themselves. */
  roles_added?: StaffRole[];
}

export interface ActivityQuery {
  type?: ActivityType;
  /** Part of a name, matched against who did it and who it was done to. */
  person?: string;
  /** Events where this staff member is the actor or the target. */
  staff_id?: string;
  from?: string;
  to?: string;
  flagged?: boolean;
  cursor?: string;
  limit?: number;
}
export interface ActivityPageOut {
  events: ActivityEventOut[];
  next_cursor: string | null;
}

export interface OversightItemOut {
  id: string;
  /** Short reference, e.g. "C-118". */
  ref: string;
  suggested_by: { display_name: string };
  specialty: string | null;
  submitted_at: string;
  eligible_reviewers: number;
  assigned_to: { display_name: string } | null;
  reminded_at: string | null;
}
export interface OversightOut {
  overdue_after_hours: number;
  waiting: number;
  median_decision_hours: number | null;
  decided_this_week: number;
  items: OversightItemOut[];
  reviewers_by_specialty: { specialty: string; reviewers: number }[];
}

export interface ReviewerOut {
  id: string;
  display_name: string;
  specialty: string | null;
}

/**
 * The admin's current two-step code, sent in the body of a remove
 * (`{ "mfa_code" }` or `{ "backup_code" }`). Errors: 403 `mfa_required`
 * (two-step not set up), 403 `mfa_invalid`, 429 `mfa_locked`.
 */
export type StaffRemoveAuth = { mfaCode: string } | { backupCode: string };
