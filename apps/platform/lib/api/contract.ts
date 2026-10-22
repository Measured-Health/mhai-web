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
  | "change_follow_up_undone";
export type ActivityEvent = {
  id: string;
  at: string;
  actor: Person;
  action: ActivityAction;
  hospital: Person | null;
  target: string | null;
  detail: string | null;
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

export interface PlatformClient {
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
}
