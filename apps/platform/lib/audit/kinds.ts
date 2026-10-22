// The audit kinds and their words (spec §4). Every line on screen and in a
// file is built here from structured fields, never from server text. A kind,
// reason, role or letter status that isn't listed makes the entry "can't be
// displayed" (see read.ts). Plans 8 and 11 add their kinds to KINDS.
import type {
  ActorRole,
  AuditEvent,
  AuditType,
  LetterStatus,
  SearchedKind,
} from "@/lib/api/audit-contract";
import { dateLabel } from "@/lib/format";

export const TYPE_WORDS: Record<AuditType, string> = {
  sign_in: "Sign-in",
  account: "Account",
  staff: "Staff and roles",
  hospital_settings: "Hospital settings",
  consultation: "Consultation",
  review: "Review",
  alerts: "Alerts",
  analysis: "Analysis",
  named_access: "Named access",
  platform: "Platform",
  export: "Export",
  audit: "Audit",
  retention: "Retention",
  security: "Security",
};

/** The closed list of reasons, in sentence case. */
export const REASON_WORDS: Record<string, string> = {
  // Deactivation.
  contract_ended: "Contract ended",
  security_concern: "Security concern",
  hospital_request: "Hospital request",
  other: "Other",
  // Export.
  legal_request: "Legal request",
  regulator_request: "Regulator request",
  internal_review: "Internal review",
  security_investigation: "Security investigation",
  // Purpose of a named drill-down.
  clinical_follow_up: "Clinical follow-up",
  quality_improvement: "Quality improvement",
  audit: "Audit",
  // Refusal.
  wrong_role: "Wrong role",
  wrong_code: "Wrong code",
  locked: "Locked",
  not_covered: "Not covered by a clearance letter",
  same_side: "Own hospital's letter",
  gone: "Already downloaded or expired",
};

export const ROLE_WORDS: Record<ActorRole, string> = {
  clinician: "Clinician",
  reviewer: "Reviewer",
  hospital_admin: "Hospital admin",
  platform_admin: "Platform admin",
  auditor: "Auditor",
  system: "System",
};

export const LETTER_STATUS_WORDS: Record<LetterStatus, string> = {
  checking: "Checking",
  refused: "Refused",
  waiting: "Waiting for verification",
  active: "Active",
  rejected: "Rejected",
  ended: "Ended",
  revoked: "Revoked",
};

/** Patient-list views (codes); anything else reads "a patient list". */
export const VIEW_WORDS: Record<string, string> = {
  condition: "Patients with a condition",
  abnormal_results: "Patients with abnormal results",
  open_alerts: "Patients with open alerts",
  follow_up_due: "Patients due a follow-up",
};
export const viewWords = (code: string | undefined) =>
  (code !== undefined && Object.hasOwn(VIEW_WORDS, code) && VIEW_WORDS[code]) ||
  "a patient list";

/** Location types (codes); anything else reads "another setting". */
export const LOCATION_WORDS: Record<string, string> = {
  inpatient: "Inpatient ward",
  outpatient: "Outpatient clinic",
  emergency: "Emergency department",
  community: "Community",
};
export const locationWords = (code: string | undefined) =>
  (code !== undefined &&
    Object.hasOwn(LOCATION_WORDS, code) &&
    LOCATION_WORDS[code]) ||
  "another setting";

export const SEARCHED_WORDS: Record<SearchedKind, string> = {
  event: "event id",
  request: "request id",
  export: "export id",
  clearance: "clearance id",
  pseudonym: "patient id",
};

const CONFIDENCE_WORDS = { high: "High", medium: "Medium", low: "Low" };

export type Kind = {
  type: AuditType;
  /** Whether the entry may carry a note. */
  note: boolean;
  words(e: AuditEvent): string;
};

const NUMBER = new Intl.NumberFormat("en-GB");
export const num = (n: number) => NUMBER.format(n);
const plural = (n: number, one: string, many: string) =>
  `${num(n)} ${n === 1 ? one : many}`;

/** The target's name, if it has one. */
const tName = (e: AuditEvent): string | null =>
  e.target && "name" in e.target && e.target.name ? e.target.name : null;
/** The hospital's name: from the entry, or from a hospital target. */
const hName = (e: AuditEvent): string =>
  e.hospital?.name ??
  (e.target?.kind === "hospital" ? tName(e) : null) ??
  "a hospital";
/** "Invited {t}", or the fallback without a name. */
const named =
  (make: (t: string) => string, without: string) => (e: AuditEvent) => {
    const t = tName(e);
    return t ? make(t) : without;
  };
/** A clearance letter's name or id. */
const letter =
  (make: (t: string) => string, without: string) => (e: AuditEvent) => {
    const t =
      tName(e) ??
      (e.target?.kind === "clearance" ? e.target.id : null) ??
      e.refs.clearance_id;
    return t ? make(t) : without;
  };
const exportId =
  (make: (t: string) => string, without: string) => (e: AuditEvent) => {
    const t =
      e.refs.export_id ?? (e.target?.kind === "export" ? e.target.id : null);
    return t ? make(t) : without;
  };
/** "Cardiology" from the code "cardiology". */
const specialty = (e: AuditEvent): string[] => {
  const s = e.facts.specialty;
  if (!s) return [];
  const w = s.replace(/_/g, " ");
  return [w.charAt(0).toUpperCase() + w.slice(1)];
};
const patients = (e: AuditEvent) =>
  e.facts.patient_count === undefined
    ? []
    : [plural(e.facts.patient_count, "patient", "patients")];
const join = (...parts: (string | string[])[]) => parts.flat().join(" · ");

const k = (
  type: AuditType,
  words: string | ((e: AuditEvent) => string),
  note = false,
): Kind => ({
  type,
  note,
  words: typeof words === "string" ? () => words : words,
});

export const KINDS: Record<string, Kind> = {
  // Sign-in.
  signed_in: k("sign_in", "Signed in"),
  sign_in_refused: k("sign_in", "Sign-in refused"),
  sign_in_locked: k("sign_in", "Sign-in locked after too many tries"),
  signed_out: k("sign_in", "Signed out"),
  // Account.
  password_changed: k("account", "Changed their password"),
  two_step_set_up: k("account", "Set up two-step"),
  backup_codes_made: k("account", "Made new backup codes"),
  device_signed_out: k("account", "Signed out a device"),
  // Staff and roles.
  staff_invited: k(
    "staff",
    named((t) => `Invited ${t}`, "Invited a staff member"),
  ),
  staff_role_changed: k(
    "staff",
    named((t) => `Changed ${t}'s role`, "Changed a staff member's role"),
  ),
  staff_deactivated: k(
    "staff",
    named((t) => `Deactivated ${t}`, "Deactivated a staff member"),
  ),
  staff_reactivated: k(
    "staff",
    named((t) => `Reactivated ${t}`, "Reactivated a staff member"),
  ),
  own_role_change_refused: k("staff", "Tried to change their own role"),
  team_invited: k(
    "staff",
    named(
      (t) => `Invited ${t} to the platform team`,
      "Invited someone to the platform team",
    ),
  ),
  team_role_changed: k(
    "staff",
    named(
      (t) => `Changed ${t}'s platform role`,
      "Changed a platform team member's role",
    ),
  ),
  team_removed: k(
    "staff",
    named(
      (t) => `Removed ${t} from the platform team`,
      "Removed someone from the platform team",
    ),
  ),
  // Hospital settings.
  hospital_added: k("hospital_settings", (e) => `Added ${hName(e)}`),
  hospital_updated: k(
    "hospital_settings",
    (e) => `Updated ${hName(e)}'s details`,
  ),
  hospital_deactivated: k(
    "hospital_settings",
    (e) => `Deactivated ${hName(e)}`,
    true,
  ),
  hospital_reactivated: k(
    "hospital_settings",
    (e) => `Reactivated ${hName(e)}`,
  ),
  removal_requested: k(
    "hospital_settings",
    (e) => `Asked to remove ${hName(e)}`,
  ),
  removal_blocked: k(
    "hospital_settings",
    (e) => `Tried to approve removing ${hName(e)}; a check blocked it`,
  ),
  removal_approved: k(
    "hospital_settings",
    (e) => `Approved removing ${hName(e)}`,
  ),
  removal_cancelled: k(
    "hospital_settings",
    (e) => `Cancelled removing ${hName(e)}`,
  ),
  hospital_removed: k("hospital_settings", (e) => `Removed ${hName(e)}`),
  sso_updated: k(
    "hospital_settings",
    (e) => `Changed single sign-on for ${hName(e)}`,
  ),
  sso_tested: k(
    "hospital_settings",
    (e) => `Tested single sign-on for ${hName(e)}`,
  ),
  setting_changed: k(
    "hospital_settings",
    named((t) => `Changed ${t}`, "Changed a setting"),
  ),
  admin_invited: k(
    "hospital_settings",
    named(
      (t) => `Invited ${t} as first hospital admin`,
      "Invited the first hospital admin",
    ),
  ),
  admin_invite_resent: k(
    "hospital_settings",
    named((t) => `Resent the invite to ${t}`, "Resent the invite"),
  ),
  // Consultation: specialty and confidence only.
  question_asked: k("consultation", (e) =>
    join(
      "Asked a question",
      specialty(e),
      e.facts.confidence
        ? [`${CONFIDENCE_WORDS[e.facts.confidence]} confidence`]
        : [],
    ),
  ),
  answer_sent_for_review: k("consultation", (e) =>
    join("Answer sent for review", specialty(e)),
  ),
  // Review.
  review_submitted: k("review", "Submitted a review"),
  review_reassigned: k("review", "Reassigned a review"),
  // Alerts.
  alert_acknowledged: k("alerts", "Acknowledged an alert"),
  alert_escalated: k("alerts", "Escalated an alert"),
  // Analysis.
  analysis_viewed: k("analysis", "Opened Analysis"),
  drilldown_deidentified: k("analysis", (e) =>
    join("Opened a de-identified patient list", patients(e)),
  ),
  // Named access.
  drilldown_named: k("named_access", (e) =>
    join("Opened a named patient list", patients(e)),
  ),
  letter_uploaded: k(
    "named_access",
    letter(
      (t) => `Uploaded clearance letter ${t}`,
      "Uploaded a clearance letter",
    ),
  ),
  letter_refused: k("named_access", "A clearance letter file was refused"),
  letter_verified: k(
    "named_access",
    letter(
      (t) => `Verified clearance letter ${t}`,
      "Verified a clearance letter",
    ),
  ),
  letter_rejected: k(
    "named_access",
    letter(
      (t) => `Rejected clearance letter ${t}`,
      "Rejected a clearance letter",
    ),
  ),
  letter_narrowed: k(
    "named_access",
    letter(
      (t) => `Narrowed clearance letter ${t}`,
      "Narrowed a clearance letter",
    ),
  ),
  letter_revoked: k(
    "named_access",
    letter(
      (t) => `Revoked clearance letter ${t}`,
      "Revoked a clearance letter",
    ),
  ),
  letter_ended: k(
    "named_access",
    letter((t) => `Clearance letter ${t} ended`, "A clearance letter ended"),
  ),
  letter_viewed: k(
    "named_access",
    letter((t) => `Viewed clearance letter ${t}`, "Viewed a clearance letter"),
  ),
  letter_reminder_sent: k(
    "named_access",
    letter(
      (t) => `Sent a reminder about clearance letter ${t}`,
      "Sent a reminder about a clearance letter",
    ),
  ),
  named_switch_changed: k("named_access", "Changed the named access switch"),
  verify_refused: k(
    "named_access",
    "Tried to verify their own hospital's letter",
  ),
  // Platform.
  change_followed_up: k(
    "platform",
    named((t) => `Marked “${t}” followed up`, "Marked a change followed up"),
    true,
  ),
  change_note_edited: k(
    "platform",
    named(
      (t) => `Edited the follow-up note on “${t}”`,
      "Edited a follow-up note",
    ),
    true,
  ),
  change_follow_up_undone: k(
    "platform",
    named((t) => `Undid the follow-up on “${t}”`, "Undid a follow-up"),
  ),
  analytics_email_changed: k("platform", "Changed their analytics email"),
  // Export.
  audit_exported: k(
    "export",
    (e) =>
      join(
        "Exported the audit log",
        e.facts.rows === undefined ? [] : [plural(e.facts.rows, "row", "rows")],
      ),
    true,
  ),
  named_access_exported: k(
    "export",
    "Exported named access for a legal request",
    true,
  ),
  export_downloaded: k(
    "export",
    exportId((t) => `Downloaded export ${t}`, "Downloaded an export"),
  ),
  export_download_refused: k(
    "export",
    exportId(
      (t) => `Tried to download export ${t} again`,
      "Tried to download an export again",
    ),
  ),
  activity_exported: k("export", "Exported a hospital's Activity"),
  // Audit.
  audit_viewed: k("audit", "Viewed the audit log"),
  audit_searched: k("audit", (e) =>
    e.facts.searched_kind
      ? `Searched the audit log by ${SEARCHED_WORDS[e.facts.searched_kind]}`
      : "Searched the audit log",
  ),
  audit_event_opened: k("audit", (e) =>
    e.target?.kind === "event"
      ? `Opened entry #${e.target.id}`
      : "Opened an entry",
  ),
  audit_patients_viewed: k("audit", "Showed patient ids for an entry"),
  audit_check_run: k("audit", (e) =>
    e.actor.kind === "system"
      ? "Daily integrity check"
      : "Ran the integrity check",
  ),
  audit_check_outcome: k(
    "audit",
    "Recorded the outcome of a failed check",
    true,
  ),
  audit_undisplayable_reported: k(
    "audit",
    "Reported an entry that couldn't be displayed",
  ),
  // Retention.
  retention_run: k("retention", (e) => {
    const { purged_count: n, before } = e.facts;
    if (n === undefined) return "Retention removed old entries";
    const removed = `Retention removed ${plural(n, "entry", "entries")}`;
    return before ? `${removed} before ${dateLabel(before)}` : removed;
  }),
  retention_checkpoint: k("retention", "Wrote a retention checkpoint"),
  re_anchor: k("retention", (e) =>
    e.facts.incident_ref
      ? `Re-anchored the log after incident ${e.facts.incident_ref}`
      : "Re-anchored the log",
  ),
  hold_placed: k("retention", (e) => `Placed a legal hold on ${hName(e)}`),
  hold_lifted: k("retention", (e) => `Lifted a legal hold on ${hName(e)}`),
  // Security.
  step_up_refused: k("security", "Two-step code refused"),
  mfa_locked: k("security", "Locked after too many wrong codes"),
  session_revoked: k("security", "Session ended by an admin"),
};

/** The kind, only if it is one of ours (never an inherited key). */
export const kindOf = (kind: string): Kind | null =>
  Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
