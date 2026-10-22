// The platform API as the platform client sees it (spec §13, backend PR #40).
// Hand-written; to be replaced by types generated from the backend OpenAPI
// schema. Every id is opaque and matches /^[A-Za-z0-9_-]+$/ (R11).
import { ApiError } from "@mhai/api-client/errors";
import type {
  AnalyticsOut,
  Change,
  MeasureId,
  Period,
  SeriesOut,
} from "./analytics-contract";
import type { HoldShort, HoldsClient } from "./holds-contract";
import type { EmailPref, NotificationsOut } from "./notifications-contract";
import type { OpsClient } from "./ops-contract";

export type HospitalStatus =
  | "active"
  | "setup_incomplete"
  | "deactivated"
  | "removal_pending"
  | "removal_scheduled"
  | "removed";
export type DeactivateReason =
  "contract_ended" | "security_concern" | "hospital_request" | "other";
export type InviteStatus = "pending" | "accepted" | "expired";
export type Person = { id: string; name: string };

export type HospitalSummary = {
  id: string;
  name: string;
  short_code: string;
  status: HospitalStatus;
  staff_count: number;
  sso_enabled: boolean;
  created_at: string;
  last_activity_at: string | null;
  /**
   * Despite the name, the holds that keep records: active, review due, lift
   * requested, or lifted within the grace period (`keepsRecords`), the same
   * set as `removal.checks.legal_holds`.
   */
  legal_holds_active: number;
};
export type Hospital = HospitalSummary & {
  country: string;
  time_zone: string;
  email_domains: string[];
  version: number;
  deactivation: {
    by: Person;
    at: string;
    reason: DeactivateReason;
    note: string | null;
  } | null;
  first_admin: {
    invite_id: string;
    name: string;
    email: string;
    status: InviteStatus;
    sent_at: string;
    expires_at: string;
  } | null;
  removal: RemovalRequest | null;
  /**
   * The hospital's active hospital admins: who to contact. Empty while the
   * hospital is in set-up, or when nobody there can act.
   */
  admins: { name: string; email: string }[];
  /** The holds that keep its records, in short form. */
  legal_holds: HoldShort[];
};

export type RemovalBlock = "legal_hold" | "retention" | "export_required";
export type RemovalRequest = {
  status: "requested" | "scheduled" | "done";
  requested_by: Person;
  /** Whether the signed-in person asked for it (they can't approve it). */
  requested_by_you: boolean;
  requested_at: string;
  reason: string;
  approved_by: Person | null;
  approved_at: string | null;
  checks: {
    legal_holds: number;
    retention_until: string | null;
    export_required: boolean;
    export_done: boolean;
  };
  blocking: RemovalBlock[];
};

export type HospitalIn = {
  name: string;
  short_code: string;
  country: string;
  time_zone: string;
  email_domains: string[];
  first_admin: { name: string; email: string };
};
export type HospitalPatch = Partial<
  Pick<
    HospitalIn,
    "name" | "short_code" | "country" | "time_zone" | "email_domains"
  >
> & { version: number };

/** The signed-in person's own two-step code, for the step-up actions. */
export type StepUp = { mfa_code: string } | { backup_code: string };

export type SsoOut = {
  enabled: boolean;
  sign_in_url: string | null;
  client_id: string | null;
  issuer: string | null;
  allowed_domains: string[];
  secret_saved: boolean;
  /** The secret's last 4 characters, never the secret. */
  secret_ends: string | null;
  last_test: { at: string; ok: boolean; message: string } | null;
  version: number;
};
export type SsoIn = {
  enabled: boolean;
  sign_in_url: string;
  client_id: string;
  issuer: string;
  allowed_domains: string[];
  /** Only when it changes; the API never sends it back. */
  client_secret?: string;
  version: number;
};

export type TeamRole = "platform_admin" | "auditor";
export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "invite_pending";
  mfa_enabled: boolean;
  last_sign_in_at: string | null;
  is_you: boolean;
  version: number;
};

export type ActivityAction =
  | "hospital_added"
  | "hospital_updated"
  | "hospital_deactivated"
  | "hospital_reactivated"
  | "removal_requested"
  | "removal_blocked"
  | "removal_approved"
  | "removal_cancelled"
  | "hospital_removed"
  | "sso_updated"
  | "sso_tested"
  | "admin_invited"
  | "admin_invite_resent"
  | "team_invited"
  | "team_role_changed"
  | "team_removed"
  | "change_followed_up"
  | "change_note_edited"
  | "change_follow_up_undone"
  // Legal holds (Plan 8a); the target is the hold's reference, never its note.
  | "hold_placed"
  | "hold_edited"
  | "hold_lift_requested"
  | "hold_lift_cancelled"
  | "hold_lift_lapsed"
  | "hold_lifted"
  | "hold_lift_undone"
  | "hold_released"
  // Failed jobs (Plan 8b); the target is a count, e.g. "3 failed jobs".
  | "jobs_retried"
  | "jobs_cancelled"
  // Platform settings (Plan 8c); the target says the change.
  | "retention_changed"
  | "setting_change_requested"
  | "setting_change_approved"
  | "setting_change_cancelled"
  | "setting_change_lapsed"
  | "clean_up_paused"
  | "clean_up_resumed"
  | "triage_switched_off"
  | "feedback_buffer_cleared";
export type ActivityEvent = {
  id: string;
  at: string;
  actor: Person;
  action: ActivityAction;
  hospital: Person | null;
  target: string | null;
  detail: string | null;
};

/** The changes that need a second platform admin's approval. */
export type TwoPersonKind = "hold_lift" | "retention_shorten" | "triage_on";
/**
 * A change one platform admin asked for and a different one must approve,
 * with step-up, within 7 days. Either may cancel it, with no step-up.
 */
export type TwoPersonRequest = {
  id: string;
  kind: TwoPersonKind;
  requested_by: Person;
  requested_at: string;
  reason: string;
  /**
   * Whether the signed-in person asked for it: the only thing that decides
   * who may approve (never a name comparison).
   */
  requested_by_you: boolean;
  /** It lapses then: an approval after it is 409 `expired`. */
  expires_at: string;
};

/** Every write sends one; the same key on a retry. */
export type WriteOpts = { idempotencyKey: string };

export type HospitalQuery = {
  status?: HospitalStatus;
  q?: string;
  cursor?: string;
};
export type ActivityQuery = { hospital?: string; cursor?: string };

/** 409 `blocked`: the removal can't be approved until these are cleared. */
export class BlockedError extends ApiError {
  constructor(readonly blocking: RemovalBlock[]) {
    super(409, "blocked");
    this.name = "BlockedError";
  }
}

/**
 * Each area (legal holds, operations, settings, the audit log) keeps its
 * client in its own contract file and adds its name to `extends` here.
 */
export interface PlatformClient extends HoldsClient, OpsClient {
  listHospitals(
    q: HospitalQuery,
  ): Promise<{ hospitals: HospitalSummary[]; next_cursor: string | null }>;
  addHospital(body: HospitalIn, opts: WriteOpts): Promise<Hospital>;
  getHospital(id: string): Promise<Hospital>;
  updateHospital(
    id: string,
    body: HospitalPatch,
    opts: WriteOpts,
  ): Promise<Hospital>;
  deactivate(
    id: string,
    body: { reason: DeactivateReason; note?: string } & StepUp,
    opts: WriteOpts,
  ): Promise<Hospital>;
  reactivate(
    id: string,
    body: { reason: string } & StepUp,
    opts: WriteOpts,
  ): Promise<Hospital>;
  requestRemoval(
    id: string,
    body: { reason: string } & StepUp,
    opts: WriteOpts,
  ): Promise<Hospital>;
  /** 409 `blocked` comes as a `BlockedError` naming what blocks it. */
  approveRemoval(id: string, body: StepUp, opts: WriteOpts): Promise<Hospital>;
  cancelRemoval(id: string, opts: WriteOpts): Promise<Hospital>;
  getSso(id: string): Promise<SsoOut>;
  saveSso(id: string, body: SsoIn, opts: WriteOpts): Promise<SsoOut>;
  testSso(id: string, opts: WriteOpts): Promise<SsoOut>;
  inviteAdmin(
    id: string,
    body: { name: string; email: string },
    opts: WriteOpts,
  ): Promise<Hospital>;
  resendInvite(
    id: string,
    inviteId: string,
    opts: WriteOpts,
  ): Promise<Hospital>;
  listTeam(): Promise<{ members: TeamMember[] }>;
  inviteTeam(
    body: { name: string; email: string; role: TeamRole },
    opts: WriteOpts,
  ): Promise<TeamMember>;
  changeRole(
    id: string,
    body: { role: TeamRole; version: number },
    opts: WriteOpts,
  ): Promise<TeamMember>;
  removeMember(id: string, body: StepUp, opts: WriteOpts): Promise<void>;
  listActivity(
    q: ActivityQuery,
  ): Promise<{ events: ActivityEvent[]; next_cursor: string | null }>;
  /** Every area for the period; What changed is always the fixed window. */
  getAnalytics(period: Period): Promise<AnalyticsOut>;
  getChangeSeries(changeId: string, period: Period): Promise<SeriesOut>;
  getHospitalSeries(
    hospitalId: string,
    measure: MeasureId,
    period: Period,
  ): Promise<SeriesOut>;
  /** Marks a change followed up, or edits the note (its author only). */
  followUp(
    changeId: string,
    body: { note?: string; version: number },
    opts: WriteOpts,
  ): Promise<Change>;
  undoFollowUp(
    changeId: string,
    body: { version: number },
    opts: WriteOpts,
  ): Promise<Change>;
  /** The signed-in person's notifications, newest first, at most 20. */
  listNotifications(): Promise<NotificationsOut>;
  /**
   * Marks the given ones seen for the signed-in person, or all of them when
   * no ids are given. Auditors may too: it is their own read state.
   */
  markSeen(
    body: { ids?: string[] },
    opts: WriteOpts,
  ): Promise<{ unseen: number }>;
  /** Platform admins only; an auditor gets 403. */
  getEmailPref(): Promise<EmailPref>;
  /** 409 `conflict` on a stale version; an auditor gets 403. */
  setEmailPref(body: EmailPref, opts: WriteOpts): Promise<EmailPref>;
}
