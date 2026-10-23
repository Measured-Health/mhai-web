// The audit kinds and their words (spec §4). Every line on screen and in a
// file is built here from structured fields, never from server text. A kind,
// reason, role or letter status that isn't listed makes the entry "can't be
// displayed" (see read.ts). Plans 8, 11 and 13 add their kinds to KINDS.
import { REJECT_LABEL, REVOKE_LABEL, STATUS_LABEL } from "@mhai/ui/clearances";
import type {
  ActorRole,
  AuditEvent,
  AuditTarget,
  AuditType,
  LetterStatus,
  SearchedKind,
} from "@/lib/api/audit-contract";
import { dateLabel, num } from "@/lib/format";

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
  // A verify refused (the 409 codes).
  same_side: "Linked to the hospital",
  same_person: "The letter names them",
  gone: "Already downloaded or expired",
  not_owner: "Made by someone else",
  // Rejecting, revoking and narrowing a clearance letter (Plan 11), in the
  // screens' words.
  wrong_people: REJECT_LABEL.wrong_people,
  end_date_mismatch: REJECT_LABEL.end_date_mismatch,
  not_leadership: REJECT_LABEL.not_leadership,
  unreadable: REJECT_LABEL.unreadable,
  no_longer_needed: REVOKE_LABEL.no_longer_needed,
  person_left: REVOKE_LABEL.person_left,
  uploaded_in_error: REVOKE_LABEL.uploaded_in_error,
  // A letter's file refused.
  file_type: "File type not accepted",
  file_too_large: "File larger than 10 MB",
  too_many_pages: "More than 20 pages",
  password_protected: "Password-protected file",
  failed_safety_check: "Didn't pass the safety check",
};

/** Why a verify was refused, as the end of a sentence. */
export const REFUSAL_WORDS: Record<string, string> = {
  same_side: "they're linked to the hospital",
  same_person: "the letter names them",
};

export const ROLE_WORDS: Record<ActorRole, string> = {
  clinician: "Clinician",
  reviewer: "Reviewer",
  hospital_admin: "Hospital admin",
  platform_admin: "Platform admin",
  auditor: "Auditor",
  system: "System",
};

/** The one set of letter status words, shared with the Clearances page. */
export const LETTER_STATUS_WORDS: Record<LetterStatus, string> = STATUS_LABEL;

/**
 * The Analysis view a patient list came from (Plan 6's view ids); anything
 * else reads "a patient list".
 */
export const VIEW_WORDS: Record<string, string> = {
  prevalence: "Prevalence and trends",
  affected: "Who is affected",
  "co-occurring": "Co-occurring conditions",
  findings: "Findings and alerts",
  quality: "MHAI quality",
};
export const viewWords = (code: string | undefined) =>
  (code !== undefined && Object.hasOwn(VIEW_WORDS, code) && VIEW_WORDS[code]) ||
  "a patient list";

/** Location types (Plan 6's settings); anything else reads "another setting". */
export const LOCATION_WORDS: Record<string, string> = {
  admitted: "Admitted",
  outpatient: "Outpatient",
  emergency: "Emergency",
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

export const CONFIDENCE_WORDS = { high: "High", medium: "Medium", low: "Low" };

export type TargetKind = AuditTarget["kind"];

export type Kind = {
  type: AuditType;
  /** Whether the entry may carry a note. */
  note: boolean;
  /** The target kinds it may name; none means no target. */
  targets: readonly TargetKind[];
  /** Whether its target may carry a name (its words use it). */
  named: boolean;
  words(e: AuditEvent): string;
};

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
/** "Added the record connection “Main record” for Havana Hospital". */
const connectionWords = (done: string) => (e: AuditEvent) => {
  const t = tName(e);
  const what = t ? `the record connection “${t}”` : "the record connection";
  return `${done} ${what} for ${hName(e)}`;
};
/** "Cardiology" from the code "cardiology". */
export const specialty = (e: AuditEvent): string[] => {
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
  opts: { note?: boolean; targets?: TargetKind[]; named?: boolean } = {},
): Kind => ({
  type,
  note: opts.note ?? false,
  targets: opts.targets ?? [],
  named: opts.named ?? false,
  words: typeof words === "string" ? () => words : words,
});

export const KINDS: Record<string, Kind> = {
  // Sign-in.
  signed_in: k("sign_in", "Signed in"),
  sign_in_refused: k("sign_in", "Sign-in refused"),
  sign_in_locked: k("sign_in", "Sign-in locked after too many tries"),
  signed_out: k("sign_in", "Signed out", { targets: ["session"] }),
  // Account.
  password_changed: k("account", "Changed their password"),
  two_step_set_up: k("account", "Set up two-step"),
  backup_codes_made: k("account", "Made new backup codes"),
  device_signed_out: k("account", "Signed out a device", {
    targets: ["session"],
  }),
  // Staff and roles.
  staff_invited: k(
    "staff",
    named((t) => `Invited ${t}`, "Invited a staff member"),
    { targets: ["staff"], named: true },
  ),
  staff_role_changed: k(
    "staff",
    named((t) => `Changed ${t}'s role`, "Changed a staff member's role"),
    { targets: ["staff"], named: true },
  ),
  staff_deactivated: k(
    "staff",
    named((t) => `Deactivated ${t}`, "Deactivated a staff member"),
    { targets: ["staff"], named: true },
  ),
  staff_reactivated: k(
    "staff",
    named((t) => `Reactivated ${t}`, "Reactivated a staff member"),
    { targets: ["staff"], named: true },
  ),
  own_role_change_refused: k("staff", "Tried to change their own role", {
    targets: ["staff", "team_member"],
  }),
  team_invited: k(
    "staff",
    named(
      (t) => `Invited ${t} to the platform team`,
      "Invited someone to the platform team",
    ),
    { targets: ["team_member"], named: true },
  ),
  team_role_changed: k(
    "staff",
    named(
      (t) => `Changed ${t}'s platform role`,
      "Changed a platform team member's role",
    ),
    { targets: ["team_member"], named: true },
  ),
  team_removed: k(
    "staff",
    named(
      (t) => `Removed ${t} from the platform team`,
      "Removed someone from the platform team",
    ),
    { targets: ["team_member"], named: true },
  ),
  // Hospital settings.
  hospital_added: k("hospital_settings", (e) => `Added ${hName(e)}`, {
    targets: ["hospital"],
    named: true,
  }),
  hospital_updated: k(
    "hospital_settings",
    (e) => `Updated ${hName(e)}'s details`,
    { targets: ["hospital"], named: true },
  ),
  hospital_deactivated: k(
    "hospital_settings",
    (e) => `Deactivated ${hName(e)}`,
    { note: true, targets: ["hospital"], named: true },
  ),
  hospital_reactivated: k(
    "hospital_settings",
    (e) => `Reactivated ${hName(e)}`,
    { targets: ["hospital"], named: true },
  ),
  removal_requested: k(
    "hospital_settings",
    (e) => `Asked to remove ${hName(e)}`,
    { targets: ["hospital"], named: true },
  ),
  removal_blocked: k(
    "hospital_settings",
    (e) => `Tried to approve removing ${hName(e)}; a check blocked it`,
    { targets: ["hospital"], named: true },
  ),
  removal_approved: k(
    "hospital_settings",
    (e) => `Approved removing ${hName(e)}`,
    { targets: ["hospital"], named: true },
  ),
  removal_cancelled: k(
    "hospital_settings",
    (e) => `Cancelled removing ${hName(e)}`,
    { targets: ["hospital"], named: true },
  ),
  hospital_removed: k("hospital_settings", (e) => `Removed ${hName(e)}`, {
    targets: ["hospital"],
    named: true,
  }),
  sso_updated: k(
    "hospital_settings",
    (e) => `Changed single sign-on for ${hName(e)}`,
    { targets: ["hospital"], named: true },
  ),
  sso_tested: k(
    "hospital_settings",
    (e) => `Tested single sign-on for ${hName(e)}`,
    { targets: ["hospital"], named: true },
  ),
  // Record connections (Plan 13): named by the source label.
  emr_connection_added: k("hospital_settings", connectionWords("Added"), {
    targets: ["connection"],
    named: true,
  }),
  emr_connection_changed: k("hospital_settings", connectionWords("Changed"), {
    targets: ["connection"],
    named: true,
  }),
  emr_connection_switched_on: k(
    "hospital_settings",
    connectionWords("Switched on"),
    { targets: ["connection"], named: true },
  ),
  emr_connection_switched_off: k(
    "hospital_settings",
    connectionWords("Switched off"),
    { targets: ["connection"], named: true },
  ),
  emr_connection_tested: k("hospital_settings", connectionWords("Tested"), {
    targets: ["connection"],
    named: true,
  }),
  setting_changed: k(
    "hospital_settings",
    named((t) => `Changed ${t}`, "Changed a setting"),
    { targets: ["setting"], named: true },
  ),
  admin_invited: k(
    "hospital_settings",
    named(
      (t) => `Invited ${t} as first hospital admin`,
      "Invited the first hospital admin",
    ),
    { targets: ["staff"], named: true },
  ),
  admin_invite_resent: k(
    "hospital_settings",
    named((t) => `Resent the invite to ${t}`, "Resent the invite"),
    { targets: ["staff"], named: true },
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
  // Alert settings (Plan 13), one per section: no target, no note.
  alert_units_changed: k("alerts", "Changed which units alerts cover"),
  alert_rules_changed: k("alerts", "Changed what alerts flag"),
  alert_recipients_changed: k("alerts", "Changed who gets alerts"),
  // Analysis.
  analysis_viewed: k("analysis", "Opened Analysis"),
  drilldown_deidentified: k(
    "analysis",
    (e) => join("Opened a de-identified patient list", patients(e)),
    { targets: ["patient"] },
  ),
  // Named access.
  drilldown_named: k(
    "named_access",
    (e) => join("Opened a named patient list", patients(e)),
    { targets: ["patient", "clearance"] },
  ),
  // One name per event: the same as the platform's Activity actions
  // (clearance_*, named_access_*).
  clearance_uploaded: k(
    "named_access",
    letter(
      (t) => `Uploaded clearance letter ${t}`,
      "Uploaded a clearance letter",
    ),
    { targets: ["clearance"], named: true },
  ),
  clearance_refused: k("named_access", "A clearance letter file was refused", {
    targets: ["clearance"],
  }),
  clearance_verified: k(
    "named_access",
    letter(
      (t) => `Verified clearance letter ${t}`,
      "Verified a clearance letter",
    ),
    { targets: ["clearance"], named: true },
  ),
  clearance_rejected: k(
    "named_access",
    letter(
      (t) => `Rejected clearance letter ${t}`,
      "Rejected a clearance letter",
    ),
    { targets: ["clearance"], named: true },
  ),
  clearance_narrowed: k(
    "named_access",
    letter(
      (t) => `Narrowed clearance letter ${t}`,
      "Narrowed a clearance letter",
    ),
    { targets: ["clearance"], named: true },
  ),
  clearance_revoked: k(
    "named_access",
    letter(
      (t) => `Revoked clearance letter ${t}`,
      "Revoked a clearance letter",
    ),
    { targets: ["clearance"], named: true },
  ),
  clearance_ended: k(
    "named_access",
    letter((t) => `Clearance letter ${t} ended`, "A clearance letter ended"),
    { targets: ["clearance"], named: true },
  ),
  clearance_viewed: k(
    "named_access",
    letter((t) => `Viewed clearance letter ${t}`, "Viewed a clearance letter"),
    { targets: ["clearance"], named: true },
  ),
  clearance_reminder_sent: k(
    "named_access",
    letter(
      (t) => `Sent a reminder about clearance letter ${t}`,
      "Sent a reminder about a clearance letter",
    ),
    { targets: ["clearance"], named: true },
  ),
  // One refusal with a reason: same_side or same_person (the 409 codes).
  clearance_verify_refused: k(
    "named_access",
    (e) => {
      const r = e.reason ?? "";
      const why = Object.hasOwn(REFUSAL_WORDS, r) ? REFUSAL_WORDS[r] : null;
      const what = letter(
        (t) => `Couldn't verify clearance letter ${t}`,
        "Couldn't verify a clearance letter",
      )(e);
      return why ? `${what}: ${why}` : what;
    },
    { targets: ["clearance"], named: true },
  ),
  named_access_requested: k(
    "named_access",
    named(
      (t) => `Asked to turn named access to ${t}`,
      "Asked to raise the named access switch",
    ),
    { targets: ["setting"], named: true },
  ),
  named_access_approved: k(
    "named_access",
    named(
      (t) => `Approved turning named access to ${t}`,
      "Approved raising the named access switch",
    ),
    { targets: ["setting"], named: true },
  ),
  named_access_cancelled: k(
    "named_access",
    named(
      (t) => `Cancelled turning named access to ${t}`,
      "Cancelled a request to raise the named access switch",
    ),
    { targets: ["setting"], named: true },
  ),
  named_access_lowered: k(
    "named_access",
    named(
      (t) => `Turned named access down to ${t}`,
      "Turned the named access switch down",
    ),
    { targets: ["setting"], named: true },
  ),
  // Platform.
  change_followed_up: k(
    "platform",
    named((t) => `Marked “${t}” followed up`, "Marked a change followed up"),
    { note: true, targets: ["change"], named: true },
  ),
  change_note_edited: k(
    "platform",
    named(
      (t) => `Edited the follow-up note on “${t}”`,
      "Edited a follow-up note",
    ),
    { note: true, targets: ["change"], named: true },
  ),
  change_follow_up_undone: k(
    "platform",
    named((t) => `Undid the follow-up on “${t}”`, "Undid a follow-up"),
    { targets: ["change"], named: true },
  ),
  analytics_email_changed: k("platform", "Changed their analytics email"),
  // The two Analysis switches (Plan 12), one name per event, the same as the
  // Activity actions: Measured Health flips them in the backend.
  analysis_switched: k("platform", (e) =>
    e.facts.switched
      ? `Turned Analysis ${e.facts.switched}`
      : "Switched Analysis on or off",
  ),
  patient_views_switched: k("platform", (e) =>
    e.facts.switched
      ? `Turned patient lists in Analysis ${e.facts.switched}`
      : "Switched patient lists in Analysis on or off",
  ),
  // Failed jobs and platform settings (Plan 8).
  // No target: the count, when sent, is `facts.job_count`.
  jobs_retried: k("platform", (e) =>
    e.facts.job_count === undefined
      ? "Retried failed jobs"
      : `Retried ${plural(e.facts.job_count, "failed job", "failed jobs")}`,
  ),
  jobs_cancelled: k("platform", (e) =>
    e.facts.job_count === undefined
      ? "Cancelled failed jobs"
      : `Cancelled ${plural(e.facts.job_count, "failed job", "failed jobs")}`,
  ),
  retention_changed: k(
    "platform",
    named(
      (t) => `Changed records retention: ${t}`,
      "Changed records retention",
    ),
    { targets: ["setting"], named: true },
  ),
  setting_change_requested: k(
    "platform",
    named((t) => `Asked for a change: ${t}`, "Asked for a change to a setting"),
    { targets: ["setting"], named: true },
  ),
  setting_change_approved: k(
    "platform",
    named((t) => `Approved a change: ${t}`, "Approved a change to a setting"),
    { targets: ["setting"], named: true },
  ),
  setting_change_cancelled: k(
    "platform",
    named(
      (t) => `Cancelled a change request: ${t}`,
      "Cancelled a change request",
    ),
    { targets: ["setting"], named: true },
  ),
  setting_change_lapsed: k(
    "platform",
    named((t) => `A change request lapsed: ${t}`, "A change request lapsed"),
    { targets: ["setting"], named: true },
  ),
  clean_up_paused: k("platform", "Paused the records clean-up"),
  clean_up_resumed: k("platform", "Resumed the records clean-up"),
  triage_switched_off: k("platform", "Switched triage off"),
  feedback_buffer_cleared: k("platform", "Cleared unapproved learning data"),
  // Export.
  audit_exported: k(
    "export",
    (e) =>
      join(
        "Exported the audit log",
        e.facts.rows === undefined ? [] : [plural(e.facts.rows, "row", "rows")],
      ),
    { note: true, targets: ["export"] },
  ),
  named_access_exported: k(
    "export",
    "Exported named access for a legal request",
    { note: true, targets: ["export"] },
  ),
  export_downloaded: k(
    "export",
    exportId((t) => `Downloaded export ${t}`, "Downloaded an export"),
    { targets: ["export"] },
  ),
  export_download_refused: k(
    "export",
    (e) =>
      e.reason === "not_owner"
        ? exportId(
            (t) => `Tried to download export ${t}, made by someone else`,
            "Tried to download an export made by someone else",
          )(e)
        : exportId(
            (t) => `Tried to download export ${t} again`,
            "Tried to download an export again",
          )(e),
    { targets: ["export"] },
  ),
  activity_exported: k("export", "Exported a hospital's Activity", {
    targets: ["export", "hospital"],
  }),
  // Audit.
  // Each list's reads are recorded on their own (`facts.list`).
  audit_viewed: k("audit", (e) =>
    e.facts.list === "named_access"
      ? "Viewed Named access in the audit log"
      : "Viewed the audit log",
  ),
  // A pseudonym searched is never sent: it reads "a patient id".
  audit_searched: k("audit", (e) =>
    e.facts.searched_kind
      ? `Searched the audit log by ${SEARCHED_WORDS[e.facts.searched_kind]}`
      : "Searched the audit log",
  ),
  audit_event_opened: k(
    "audit",
    (e) =>
      e.target?.kind === "event"
        ? `Opened entry #${e.target.id}`
        : "Opened an entry",
    { targets: ["event"] },
  ),
  audit_patients_viewed: k("audit", "Showed patient ids for an entry", {
    targets: ["event"],
  }),
  audit_check_run: k(
    "audit",
    (e) =>
      e.actor.kind === "system"
        ? "Daily integrity check"
        : "Ran the integrity check",
    { targets: ["run"] },
  ),
  audit_check_outcome: k("audit", "Recorded the outcome of a failed check", {
    note: true,
    targets: ["run"],
  }),
  audit_undisplayable_reported: k(
    "audit",
    "Reported an entry that couldn't be displayed",
    { targets: ["event"] },
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
  hold_placed: k("retention", (e) => `Placed a legal hold on ${hName(e)}`, {
    targets: ["hold", "hospital"],
    named: true,
  }),
  hold_lifted: k("retention", (e) => `Lifted a legal hold on ${hName(e)}`, {
    targets: ["hold", "hospital"],
    named: true,
  }),
  hold_edited: k(
    "retention",
    (e) => `Changed the review date or note on a legal hold on ${hName(e)}`,
    { targets: ["hold", "hospital"], named: true },
  ),
  hold_lift_requested: k(
    "retention",
    (e) => `Asked to lift a legal hold on ${hName(e)}`,
    { targets: ["hold", "hospital"], named: true },
  ),
  hold_lift_cancelled: k(
    "retention",
    (e) => `Cancelled the request to lift a legal hold on ${hName(e)}`,
    { targets: ["hold", "hospital"], named: true },
  ),
  hold_lift_lapsed: k(
    "retention",
    (e) => `The request to lift a legal hold on ${hName(e)} lapsed`,
    { targets: ["hold", "hospital"], named: true },
  ),
  hold_lift_undone: k(
    "retention",
    (e) => `Undid the lift of a legal hold on ${hName(e)}`,
    { targets: ["hold", "hospital"], named: true },
  ),
  hold_released: k(
    "retention",
    (e) => `Released the records under a legal hold on ${hName(e)}`,
    { targets: ["hold", "hospital"], named: true },
  ),
  // Security.
  step_up_refused: k("security", "Two-step code refused"),
  mfa_locked: k("security", "Locked after too many wrong codes"),
  session_revoked: k("security", "Session ended by an admin", {
    targets: ["session"],
  }),
};

/** The kind, only if it is one of ours (never an inherited key). */
export const kindOf = (kind: string): Kind | null =>
  Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
