// The hospital admin API, hand-written from Plan 4's assumed contract
// (spec §10 items 2 and 3). To be replaced by types generated from the
// backend OpenAPI schema. Nothing here can carry question text, results or
// patient details: keep it that way. The usage contract carries alert counts
// only, never patients, MRNs, beds or alert ids.

import type { AlertSeverity } from "./alerts-contract";
import type { NamedPurpose } from "./analysis-contract";

export type StaffRole = "clinician" | "analyst" | "hospital_admin";
/** Core has no invites: never `invited`. */
export type StaffStatus = "active" | "deactivated";
export type SignInMethod = "sso" | "password_mfa" | "password";
export type StaffIssue = "mfa_not_set_up";

export interface StaffOut {
  id: string;
  full_name: string;
  display_name: string;
  email: string;
  roles: StaffRole[];
  specialty: string | null;
  /** Derived by core: an active clinician reviews (core 1.24.0). */
  can_review: boolean;
  /** Always empty: core has no reviewing by specialty yet (every specialty). */
  review_specialties: string[];
  status: StaffStatus;
  issues: StaffIssue[];
  sign_in: SignInMethod | null;
  last_active_at: string | null; // ISO 8601
  joined_at: string | null;
  /** Always null: core has no invites. */
  invited_at: null;
  invite_expires_at: null;
  /** The signed-in admin's own row (the API decides, R15). */
  is_you: boolean;
  /** Sent back on edits; a stale one gets 409 `conflict` (R7). */
  version: number;
}

/**
 * Roles and specialty. Core derives reviewing (`can_review` follows the
 * clinician role, `review_specialties` is empty), so the app never sends it.
 * Sent with the admin's step-up code.
 */
export interface StaffPatchIn {
  version: number;
  roles?: StaffRole[];
  specialty?: string | null;
}

export type SsoStatus = "connected" | "not_set_up" | "error";

export interface HospitalSettingsOut {
  hospital_name: string;
  review_overdue_hours: number;
  reviewers_share_specialty: boolean;
  require_mfa_for_clinicians: boolean;
  idle_timeout_minutes: number;
  allow_trust_device: boolean;
  /** Read-only here: Measured Health configures sign-in (core: `not_set_up`). */
  sso: { status: SsoStatus; domain: string | null };
  /** Core sends none yet (no invites). */
  allowed_email_domains: string[];
  /** The active staff's specialties, for pickers. */
  specialties: string[];
  /** The choices Measured Health allows. */
  limits: { review_overdue_hours: number[]; idle_timeout_minutes: number[] };
  version: number;
}
/**
 * What an admin can change. `reviewers_share_specialty` is always false in
 * core (no reviewing by specialty), so it's shown, never sent.
 */
export type SettingsEditable = Pick<
  HospitalSettingsOut,
  | "review_overdue_hours"
  | "require_mfa_for_clinicians"
  | "idle_timeout_minutes"
  | "allow_trust_device"
>;
export type SettingsPatchIn = Partial<SettingsEditable> & { version: number };

/**
 * Whether an edit loosens sign-in, as core decides it: two-step for
 * clinicians off, "trust this device" on, or a longer idle timeout. Such an
 * edit needs the admin's step-up code.
 */
export function loosensSignIn(
  saved: Pick<HospitalSettingsOut, "idle_timeout_minutes">,
  p: Partial<SettingsEditable>,
): boolean {
  return (
    p.require_mfa_for_clinicians === false ||
    p.allow_trust_device === true ||
    (p.idle_timeout_minutes !== undefined &&
      p.idle_timeout_minutes > saved.idle_timeout_minutes)
  );
}

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
   * Patient alerts (core's `HospitalUsageAlertsOut`, OpenAPI 1.24.0). Null:
   * the hospital has no record source. `{ unavailable: true }`: the rest of
   * usage is fine but the alert numbers couldn't be computed.
   */
  alerts: UsageAlertsOut | UsageAlertsUnavailableOut | null;
}

/**
 * A count under the small-group rule. A hidden value is
 * `{ value: null, suppressed: true }`; never 1 to 4.
 */
export interface GuardedOut {
  value: number | null;
  suppressed: boolean;
}

export type AlertCategory =
  | "blood_chemistry"
  | "blood_count"
  | "kidney_function"
  | "blood_gases_lactate"
  | "heart_markers"
  | "blood_sugar"
  | "vital_signs"
  | "infection_markers";
/** On the hospital's queue, or sent to named clinicians. */
export type AlertRoute = "queue" | "named";
/**
 * Still new; acknowledged; dismissed by a clinician; withdrawn (by the
 * source or an exclusion) before anyone handled it.
 */
export type AlertHandling = "open" | "acknowledged" | "dismissed" | "withdrawn";

/**
 * The alert block of Usage, exactly as core sends it: the period's alerts by
 * severity, category, route and handling. Each breakdown is guarded as a set
 * with the total, so a hidden part can't be worked out from the rest.
 */
export interface UsageAlertsOut {
  total: GuardedOut;
  by_severity: Record<AlertSeverity, GuardedOut>;
  by_category: Record<AlertCategory, GuardedOut>;
  by_route: Record<AlertRoute, GuardedOut>;
  by_handling: Record<AlertHandling, GuardedOut>;
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
  | "roles_changed"
  | "specialty_changed"
  | "deactivated"
  | "reactivated"
  | "settings_changed"
  | "policy_breach"
  | "analyst_granted"
  | "analyst_removed"
  | "analysis_patients_viewed"
  | "clearance_uploaded"
  | "clearance_refused"
  | "clearance_verified"
  | "clearance_rejected"
  | "clearance_narrowed"
  | "clearance_revoked"
  | "clearance_ended"
  | "clearance_viewed"
  | "clearance_reminder_sent"
  | "analysis_named_viewed"
  /** Alert settings (Plan 13): one event per section saved. */
  | "alert_units_changed"
  | "alert_rules_changed"
  | "alert_recipients_changed";

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
  /** Always null from core (1.24.0). */
  device: null;
  /** Always null from core (1.24.0). */
  count: null;
  /** Core flags no event today. */
  flag: "policy" | "alert" | null;
  /** On a named view in Analysis: why the person asked for names. */
  purpose?: NamedPurpose;
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
 * The admin's current two-step code (step-up), sent in the body of every
 * staff write and of a settings edit that loosens sign-in, as `{ "mfa_code" }`
 * or `{ "backup_code" }`. Errors: 403 `mfa_required` (two-step not set up),
 * 403 `mfa_invalid`, 429 `mfa_locked`. Core checks it last, after every
 * refusal that needs no code, so a refused request doesn't spend it.
 */
export type StepUpAuth = { mfaCode: string } | { backupCode: string };

/** The body fields a step-up code is sent as. */
export const stepUpBody = (a: StepUpAuth) =>
  "mfaCode" in a ? { mfa_code: a.mfaCode } : { backup_code: a.backupCode };
