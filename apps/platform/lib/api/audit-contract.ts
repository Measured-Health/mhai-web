// The audit log API as the platform client sees it (spec §13 and §14.9).
// Hand-written; to be replaced by types generated from the backend OpenAPI
// schema. Every id is opaque and matches /^[A-Za-z0-9_-]+$/.
import { ApiError } from "@mhai/api-client/errors";
import type { Person, StepUp, WriteOpts } from "./contract";

export const AUDIT_TYPES = [
  "sign_in",
  "account",
  "staff",
  "hospital_settings",
  "consultation",
  "review",
  "alerts",
  "analysis",
  "named_access",
  "platform",
  "export",
  "audit",
  "retention",
  "security",
] as const;
export type AuditType = (typeof AUDIT_TYPES)[number];
export type Outcome = "succeeded" | "refused" | "failed";
export type ActorKind = "staff" | "platform" | "system";
export type ActorRole =
  | "clinician"
  | "reviewer"
  | "hospital_admin"
  | "platform_admin"
  | "auditor"
  | "system";
export type AuditActor = {
  id: string;
  name: string;
  role: ActorRole;
  kind: ActorKind;
};
export type AuditHospital = { id: string; name: string; removed: boolean };
export type AuditTarget =
  | {
      kind:
        | "staff"
        | "hospital"
        | "setting"
        | "clearance"
        | "team_member"
        | "change"
        | "hold";
      id: string;
      name?: string;
    }
  | { kind: "export" | "run" | "event" | "session"; id: string }
  // A patient target never carries the pseudonym: the ids are only ever
  // sent by GET /platform/audit/{id}/patients, which is recorded.
  | { kind: "patient" };
/**
 * A hospital's pseudonymous patient id starts `p_`, and no other id does.
 * Outside the recorded reveal, a pseudonym is never sent: where one was
 * searched or filtered on, the server sends this marker instead.
 */
export const PSEUDONYM_PREFIX = "p_";
export type PatientIdMarker = { kind: "patient_id" };
/** The list a read was of: Events or Named access. */
export type AuditListName = "events" | "named_access";
export type SearchedKind =
  "event" | "request" | "export" | "clearance" | "pseudonym";
export type RunState = "running" | "intact" | "broken" | "error";
export type AuditFilters = {
  hospital?: string; // a hospital id, or "platform"
  person?: string; // a person id from the picker
  type?: AuditType[];
  outcome?: Outcome;
  flagged?: boolean;
  from?: string; // ISO instants, [from, to)
  to?: string;
  q?: string; // an exact id or pseudonym
};
/**
 * Filters as recorded (in an entry's facts and an export record): a
 * pseudonym searched is the marker, never the value.
 */
export type RecordedFilters = Omit<AuditFilters, "q"> & {
  q?: string | PatientIdMarker;
};
export type AuditFacts = {
  specialty?: string;
  confidence?: "high" | "medium" | "low";
  view?: string;
  location_type?: string;
  from?: string;
  to?: string;
  patient_count?: number;
  purpose?: "clinical_follow_up" | "quality_improvement" | "audit" | "other";
  purged_count?: number;
  before?: string;
  checkpoint_id?: string;
  incident_ref?: string;
  filters?: RecordedFilters;
  /** The id searched; for a pseudonym, the marker (spec §13). */
  searched?: string | PatientIdMarker;
  searched_kind?: SearchedKind;
  rows?: number;
  capped?: boolean;
  checksum?: string;
  state?: RunState;
  first_broken_seq?: number;
  /** On `audit_viewed`: which list was read. */
  list?: AuditListName;
  /** On `jobs_retried` and `jobs_cancelled`: how many jobs. */
  job_count?: number;
};
export type AuditEvent = {
  id: string;
  seq: number;
  hash: string;
  at: string;
  actor: AuditActor;
  hospital: AuditHospital | null;
  type: AuditType;
  kind: string;
  target: AuditTarget | null;
  outcome: Outcome;
  ip: string | null;
  device: string | null;
  flag: "security" | "policy" | null;
  reason: string | null;
  note: string | null;
  refs: {
    clearance_id: string | null;
    export_id: string | null;
    request_id: string | null;
  };
  facts: AuditFacts;
  after_break: boolean;
};
export type LetterStatus =
  | "checking"
  | "refused"
  | "waiting"
  | "active"
  | "rejected"
  | "ended"
  | "revoked";
export type Letter = {
  id: string;
  status: LetterStatus;
  valid_from: string;
  valid_to: string;
  verified_by: Person | null;
};
export type AuditDetail = AuditEvent & {
  patients: { count: number } | null;
  letter: Letter | null;
};
export type Checkpoint = {
  id: string;
  at: string;
  purged_count: number;
  before: string;
  kind: "retention" | "re_anchor";
  incident_ref: string | null;
  reason: string;
};
export type AuditList = {
  events: AuditEvent[];
  next_cursor: string | null;
  total: number;
  total_capped: boolean;
  oldest_kept_at: string;
  last_checkpoint: Checkpoint | null;
};
export type AuditPerson = {
  id: string;
  name: string;
  email: string;
  role: ActorRole;
  kind: ActorKind;
  hospital: Person | null;
};
export type NamedAccessFilters = {
  hospital?: string;
  person?: string;
  clearance?: string;
  from?: string;
  to?: string;
};
export type NamedAccessList = {
  events: (AuditEvent & { letter: Letter })[];
  next_cursor: string | null;
};
export type ExportKind = "events" | "named_access";
export type ExportReason =
  | "legal_request"
  | "hospital_request"
  | "regulator_request"
  | "internal_review"
  | "security_investigation"
  | "other";
export type ExportIn = {
  kind: ExportKind;
  filters: AuditFilters | NamedAccessFilters;
  reason: ExportReason;
  note?: string;
  reference?: string;
} & StepUp;
export type ExportOut = {
  export_id: string;
  rows: number;
  capped: boolean;
  checksum: string;
  expires_at: string;
  file_name: string;
};
export type ExportRecord = {
  id: string;
  kind: ExportKind;
  by: Person;
  at: string;
  reason: ExportReason;
  note: string | null;
  reference: string | null;
  filters: RecordedFilters | NamedAccessFilters;
  filter_names: {
    hospital: string | null;
    person: string | null;
    clearance: string | null;
  };
  rows: number;
  capped: boolean;
  checksum: string;
  expires_at: string;
  downloaded_at: string | null;
};
export type VerifyRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  by: Person | null; // null: the daily schedule
  state: RunState;
  entries_checked: number | null;
  from_checkpoint: Checkpoint | null;
  from_first: boolean;
  to_seq: number | null;
  to_at: string | null;
  first_broken_seq: number | null;
  /** The first broken entry's id: set exactly when first_broken_seq is. */
  first_broken_id: string | null;
  first_broken_at: string | null;
  error_code: "timed_out" | "unreachable" | "unexpected_reply" | null;
  outcome: { note: string; by: Person; at: string } | null;
  version: number;
};
export type IntegrityStatus = {
  latest: VerifyRun | null;
  running: VerifyRun | null;
  open_failure: VerifyRun | null;
  security_contact: { name: string; email: string };
  oldest_kept_at: string;
};

export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_NOTE_MAX = 200;
export const EXPORT_REFERENCE_MAX = 60;
export const OUTCOME_NOTE_MAX = 1000;

/** 422 `too_many_rows`: more entries match than one export may hold. */
export class TooManyRowsError extends ApiError {
  constructor(readonly rows: number) {
    super(422, "too_many_rows");
    this.name = "TooManyRowsError";
  }
}

export interface AuditClient {
  listAudit(f: AuditFilters, cursor?: string): Promise<AuditList>;
  getAuditEvent(id: string): Promise<AuditDetail>;
  getAuditPatients(id: string): Promise<{ pseudonyms: string[] }>;
  searchAuditPeople(q: string): Promise<{ people: AuditPerson[] }>;
  listAuditHospitals(): Promise<{ hospitals: AuditHospital[] }>;
  reportUndisplayable(ids: string[], opts: WriteOpts): Promise<void>;
  listNamedAccess(
    f: NamedAccessFilters,
    cursor?: string,
  ): Promise<NamedAccessList>;
  /** 422 `too_many_rows` → `TooManyRowsError`. */
  createExport(body: ExportIn, opts: WriteOpts): Promise<ExportOut>;
  /** 410 `gone` after one download or `expires_at`. */
  downloadExport(id: string): Promise<Blob>;
  listExports(
    cursor?: string,
  ): Promise<{ exports: ExportRecord[]; next_cursor: string | null }>;
  /** Returns the running check, if there is one. */
  startCheck(opts: WriteOpts): Promise<{ run_id: string }>;
  getIntegrityStatus(): Promise<IntegrityStatus>;
  listRuns(
    cursor?: string,
  ): Promise<{ runs: VerifyRun[]; next_cursor: string | null }>;
  getRun(id: string): Promise<VerifyRun>;
  addOutcome(
    runId: string,
    body: { note: string; version: number },
    opts: WriteOpts,
  ): Promise<VerifyRun>;
}
