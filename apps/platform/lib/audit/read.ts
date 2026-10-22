// Reading the audit log's replies (spec §5, fail closed). Every entry is
// checked against its exact shape: every key known, nothing else, at every
// level. An entry that doesn't fit becomes an undisplayable row that keeps
// only its id and position, never its content. A reply whose envelope
// doesn't fit throws `bad_reply`, and the page shows "Couldn't load".
import { ApiError } from "@mhai/api-client/errors";
import {
  AUDIT_TYPES,
  EXPORT_NOTE_MAX,
  EXPORT_REFERENCE_MAX,
  OUTCOME_NOTE_MAX,
  type AuditDetail,
  type AuditEvent,
  type AuditList,
  type Checkpoint,
  type ExportRecord,
  type IntegrityStatus,
  type Letter,
  type VerifyRun,
} from "@/lib/api/audit-contract";
import { LETTER_STATUS_WORDS, REASON_WORDS, ROLE_WORDS, kindOf } from "./kinds";

export const ID = /^[A-Za-z0-9_-]+$/;
const HASH = /^[0-9a-f]{64}$/;
const CODE = /^[a-z][a-z_]{0,39}$/;
const DEVICE = /^[\w .,()/;:+-]*$/;
const IPV4 =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const NAME_MAX = 120;
const EVENT_NOTE_MAX = 500;

type Obj = Record<string, unknown>;
type Check = (v: unknown) => boolean;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const isCode = (v: unknown) => typeof v === "string" && CODE.test(v);
const isBool = (v: unknown) => typeof v === "boolean";
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isPos = (v: unknown): v is number => isCount(v) && v > 0;
const isTime = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}/.test(v) &&
  !Number.isNaN(Date.parse(v));
const text = (min: number, max: number) => (v: unknown) =>
  typeof v === "string" && v.length >= min && v.length <= max;
const oneOf =
  (...xs: readonly unknown[]) =>
  (v: unknown) =>
    xs.includes(v);
const own = (map: object) => (v: unknown) =>
  typeof v === "string" && Object.hasOwn(map, v);
const orNull = (c: Check) => (v: unknown) => v === null || c(v);
const listOf = (c: Check) => (v: unknown) => Array.isArray(v) && v.every(c);

/** Exactly these keys (each present), each passing its check. */
const exact = (shape: Record<string, Check>) => (v: unknown) =>
  isObj(v) &&
  Object.keys(v).length === Object.keys(shape).length &&
  Object.entries(shape).every(([k, c]) => Object.hasOwn(v, k) && c(v[k]));
/** Only these keys, each optional, each passing its check when present. */
const some = (shape: Record<string, Check>) => (v: unknown) =>
  isObj(v) &&
  Object.entries(v).every(
    ([k, x]) => Object.hasOwn(shape, k) && x !== undefined && shape[k](x),
  );

function isIp(v: unknown): boolean {
  if (typeof v !== "string") return false;
  if (IPV4.test(v)) return true;
  if (!/^[0-9A-Fa-f:.]{2,45}$/.test(v) || !v.includes(":")) return false;
  try {
    return new URL(`http://[${v}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

const isPerson = exact({ id: isId, name: text(1, NAME_MAX) });
const OUTCOMES = ["succeeded", "refused", "failed"] as const;
const isTypes = (v: unknown) =>
  Array.isArray(v) && v.every(oneOf(...AUDIT_TYPES));

const isFilters = some({
  hospital: isId,
  person: isId,
  clearance: isId,
  type: isTypes,
  outcome: oneOf(...OUTCOMES),
  flagged: isBool,
  from: isTime,
  to: isTime,
  q: isId,
});

const isCheckpoint = exact({
  id: isId,
  at: isTime,
  purged_count: isCount,
  before: isTime,
  kind: oneOf("retention", "re_anchor"),
  incident_ref: orNull(isId),
  reason: isCode,
});

const isFacts = some({
  specialty: isCode,
  confidence: oneOf("high", "medium", "low"),
  view: isCode,
  location_type: isCode,
  from: isTime,
  to: isTime,
  patient_count: isCount,
  purpose: oneOf("clinical_follow_up", "quality_improvement", "audit", "other"),
  purged_count: isCount,
  before: isTime,
  checkpoint_id: isId,
  incident_ref: isId,
  filters: isFilters,
  searched: isId,
  searched_kind: oneOf("event", "request", "export", "clearance", "pseudonym"),
  rows: isCount,
  capped: isBool,
  checksum: (v) => typeof v === "string" && HASH.test(v),
  state: oneOf("running", "intact", "broken", "error"),
  first_broken_seq: isPos,
});

/** A patient is only ever a pseudonym; only these kinds carry a name. */
const NAMED_TARGETS = [
  "staff",
  "hospital",
  "setting",
  "clearance",
  "team_member",
  "change",
  "hold",
] as const;
const PLAIN_TARGETS = ["export", "run", "event", "session"] as const;
function isTarget(v: unknown): boolean {
  if (v === null) return true;
  if (!isObj(v)) return false;
  if (v.kind === "patient")
    return exact({ kind: () => true, pseudonym: isId })(v);
  if (PLAIN_TARGETS.includes(v.kind as never))
    return exact({ kind: () => true, id: isId })(v);
  if (!NAMED_TARGETS.includes(v.kind as never)) return false;
  return "name" in v
    ? exact({ kind: () => true, id: isId, name: text(1, NAME_MAX) })(v)
    : exact({ kind: () => true, id: isId })(v);
}

const EVENT: Record<string, Check> = {
  id: isId,
  seq: isPos,
  hash: (v) => typeof v === "string" && HASH.test(v),
  at: isTime,
  actor: exact({
    id: isId,
    name: text(1, NAME_MAX),
    role: own(ROLE_WORDS),
    kind: oneOf("staff", "platform", "system"),
  }),
  hospital: orNull(
    exact({ id: isId, name: text(1, NAME_MAX), removed: isBool }),
  ),
  type: oneOf(...AUDIT_TYPES),
  kind: (v) => typeof v === "string" && kindOf(v) !== null,
  target: isTarget,
  outcome: oneOf(...OUTCOMES),
  ip: orNull(isIp),
  device: orNull(
    (v) => typeof v === "string" && v.length <= 80 && DEVICE.test(v),
  ),
  flag: oneOf("security", "policy", null),
  reason: orNull(own(REASON_WORDS)),
  note: orNull(text(1, EVENT_NOTE_MAX)),
  refs: exact({
    clearance_id: orNull(isId),
    export_id: orNull(isId),
    request_id: orNull(isId),
  }),
  facts: isFacts,
  after_break: isBool,
};
const isEventShape = exact(EVENT);

/** The rules across fields: the kind's type, and a note only where allowed. */
function isEvent(v: unknown): v is AuditEvent {
  if (!isEventShape(v)) return false;
  const e = v as AuditEvent;
  const kind = kindOf(e.kind)!;
  return kind.type === e.type && (e.note === null || kind.note);
}

export type Undisplayable = {
  ok: false;
  id: string | null;
  seq: number | null;
};
export type Row<T> = { ok: true; event: T } | Undisplayable;
export type AuditRow = Row<AuditEvent>;

const undisplayable = (raw: unknown): Undisplayable => ({
  ok: false,
  id: isObj(raw) && isId(raw.id) ? raw.id : null,
  seq: isObj(raw) && isPos(raw.seq) ? raw.seq : null,
});

export function readAuditEvent(raw: unknown): AuditRow {
  return isEvent(raw) ? { ok: true, event: raw } : undisplayable(raw);
}

/** An event with extra keys of its own, each checked, read strictly. */
function readWith<T extends AuditEvent>(
  raw: unknown,
  extra: Record<string, Check>,
): Row<T> {
  if (!isObj(raw)) return undisplayable(raw);
  const rest: Obj = {};
  for (const [k, v] of Object.entries(raw))
    if (!Object.hasOwn(extra, k)) rest[k] = v;
  const ok =
    Object.entries(extra).every(
      ([k, c]) => Object.hasOwn(raw, k) && c(raw[k]),
    ) && isEvent(rest);
  return ok ? { ok: true, event: raw as T } : undisplayable(raw);
}

const badReply = () => new ApiError(0, "bad_reply");
const isCursor = orNull(text(1, 512));

export function readAuditList(
  raw: unknown,
): Omit<AuditList, "events"> & { events: AuditRow[] } {
  if (
    !isObj(raw) ||
    !Array.isArray(raw.events) ||
    !isCursor(raw.next_cursor) ||
    !isCount(raw.total) ||
    !isBool(raw.total_capped) ||
    !isTime(raw.oldest_kept_at) ||
    !orNull(isCheckpoint)(raw.last_checkpoint)
  )
    throw badReply();
  return {
    events: raw.events.map(readAuditEvent),
    next_cursor: raw.next_cursor as string | null,
    total: raw.total,
    total_capped: raw.total_capped as boolean,
    oldest_kept_at: raw.oldest_kept_at,
    last_checkpoint: raw.last_checkpoint as Checkpoint | null,
  };
}

const isLetter = exact({
  id: isId,
  status: own(LETTER_STATUS_WORDS),
  valid_from: isTime,
  valid_to: isTime,
  verified_by: orNull(isPerson),
});

export function readDetail(raw: unknown): Row<AuditDetail> {
  return readWith<AuditDetail>(raw, {
    patients: orNull(exact({ count: isCount })),
    letter: orNull(isLetter),
  });
}

export type NamedRow = Row<AuditEvent & { letter: Letter }>;
export function readNamedAccess(raw: unknown): {
  events: NamedRow[];
  next_cursor: string | null;
} {
  if (!isObj(raw) || !Array.isArray(raw.events) || !isCursor(raw.next_cursor))
    throw badReply();
  return {
    events: raw.events.map((e) => readWith(e, { letter: isLetter })),
    next_cursor: raw.next_cursor as string | null,
  };
}

const isExportRecord = exact({
  id: isId,
  kind: oneOf("events", "named_access"),
  by: isPerson,
  at: isTime,
  reason: oneOf(
    "legal_request",
    "hospital_request",
    "regulator_request",
    "internal_review",
    "security_investigation",
    "other",
  ),
  note: orNull(text(1, EXPORT_NOTE_MAX)),
  reference: orNull(text(1, EXPORT_REFERENCE_MAX)),
  filters: isFilters,
  filter_names: exact({
    hospital: orNull(text(1, NAME_MAX)),
    person: orNull(text(1, NAME_MAX)),
    clearance: orNull(text(1, NAME_MAX)),
  }),
  rows: isCount,
  capped: isBool,
  checksum: (v) => typeof v === "string" && HASH.test(v),
  expires_at: isTime,
  downloaded_at: orNull(isTime),
});

export type ExportRow =
  { ok: true; record: ExportRecord } | { ok: false; id: string | null };
export function readExportRecord(raw: unknown): ExportRow {
  return isExportRecord(raw)
    ? { ok: true, record: raw as ExportRecord }
    : { ok: false, id: isObj(raw) && isId(raw.id) ? raw.id : null };
}

/** A page of exports; a bad envelope throws `bad_reply`. */
export function readExportList(raw: unknown): {
  exports: ExportRow[];
  next_cursor: string | null;
} {
  if (!isObj(raw) || !Array.isArray(raw.exports) || !isCursor(raw.next_cursor))
    throw badReply();
  return {
    exports: raw.exports.map(readExportRecord),
    next_cursor: raw.next_cursor as string | null,
  };
}

/**
 * A run as read. One that fails its shape keeps its id and start when
 * those read (else null), and becomes an error: never dropped, never Intact.
 */
export type ReadRun = Omit<VerifyRun, "id" | "started_at"> & {
  id: string | null;
  started_at: string | null;
};
const isRun = exact({
  id: isId,
  started_at: isTime,
  finished_at: orNull(isTime),
  by: orNull(isPerson),
  state: oneOf("running", "intact", "broken", "error"),
  entries_checked: orNull(isCount),
  from_checkpoint: orNull(isCheckpoint),
  from_first: isBool,
  to_seq: orNull(isPos),
  to_at: orNull(isTime),
  first_broken_seq: orNull(isPos),
  first_broken_at: orNull(isTime),
  error_code: oneOf("timed_out", "unreachable", "unexpected_reply", null),
  outcome: orNull(
    exact({ note: text(1, OUTCOME_NOTE_MAX), by: isPerson, at: isTime }),
  ),
  version: isCount,
});

export function readRun(raw: unknown): ReadRun {
  if (isRun(raw)) return raw as VerifyRun;
  return {
    id: isObj(raw) && isId(raw.id) ? raw.id : null,
    started_at: isObj(raw) && isTime(raw.started_at) ? raw.started_at : null,
    finished_at: null,
    by: null,
    state: "error",
    entries_checked: null,
    from_checkpoint: null,
    from_first: false,
    to_seq: null,
    to_at: null,
    first_broken_seq: null,
    first_broken_at: null,
    error_code: "unexpected_reply",
    outcome: null,
    version: 0,
  };
}

/** A page of runs; a bad envelope throws `bad_reply`. */
export function readRunList(raw: unknown): {
  runs: ReadRun[];
  next_cursor: string | null;
} {
  if (!isObj(raw) || !Array.isArray(raw.runs) || !isCursor(raw.next_cursor))
    throw badReply();
  return {
    runs: raw.runs.map(readRun),
    next_cursor: raw.next_cursor as string | null,
  };
}

export type ReadStatus = Omit<
  IntegrityStatus,
  "latest" | "running" | "open_failure"
> & {
  latest: ReadRun | null;
  running: ReadRun | null;
  open_failure: ReadRun | null;
};
const isContact = exact({
  name: text(1, NAME_MAX),
  email: (v) =>
    typeof v === "string" && v.length <= 254 && /^[^\s@<>]+@[^\s@<>]+$/.test(v),
});

/** A run present but malformed reads as an error run, never as none. */
export function readStatus(raw: unknown): ReadStatus {
  if (
    !isObj(raw) ||
    !["latest", "running", "open_failure"].every((k) =>
      Object.hasOwn(raw, k),
    ) ||
    !isContact(raw.security_contact) ||
    !isTime(raw.oldest_kept_at)
  )
    throw badReply();
  const run = (v: unknown) => (v === null ? null : readRun(v));
  return {
    latest: run(raw.latest),
    running: run(raw.running),
    open_failure: run(raw.open_failure),
    security_contact:
      raw.security_contact as IntegrityStatus["security_contact"],
    oldest_kept_at: raw.oldest_kept_at,
  };
}

/** The bell's integrity item (Task 4), exactly. */
export const integrityNotificationOk = (n: unknown): boolean =>
  exact({
    kind: oneOf("audit_integrity"),
    id: isId,
    run_id: isId,
    first_broken_seq: isPos,
    at: isTime,
    seen: isBool,
  })(n);

/**
 * A named-access file row: the entry plus the pseudonyms on its list, and
 * optionally its letter. Read as strictly as an entry.
 */
export function readNamedFileRow(
  raw: unknown,
): Row<AuditEvent & { pseudonyms: string[] }> {
  if (isObj(raw) && Object.hasOwn(raw, "letter")) {
    const { letter, ...rest } = raw;
    if (!isLetter(letter)) return undisplayable(raw);
    return readWith(rest, { pseudonyms: listOf(isId) });
  }
  return readWith(raw, { pseudonyms: listOf(isId) });
}
