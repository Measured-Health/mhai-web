// The hospital admin API, hand-written from Plan 4's assumed contract
// (spec §10 items 2 and 3). To be replaced by types generated from the
// backend OpenAPI schema. Nothing here can carry question text, results or
// patient details: keep it that way.

export type StaffRole = "clinician" | "hospital_admin";
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
