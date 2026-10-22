// The reference file builder (spec §7.1): what an export holds. The mock
// uses it, and the backend copies it. Key and value rows first (who, when,
// why, the filters), a blank row, then the table. Every row carries its
// position and fingerprint; a row that doesn't read is "Not displayable".
// Patients appear only as pseudonyms, and only in named-access files.
import { toCsv, type Cell } from "@mhai/ui/csv";
import type {
  AuditEvent,
  AuditTarget,
  ExportKind,
  ExportReason,
} from "@/lib/api/audit-contract";
import type { Person } from "@/lib/api/contract";
import { REASON_WORDS, ROLE_WORDS, TYPE_WORDS, viewWords } from "./kinds";
import { readAuditEvent, readNamedFileRow, type Undisplayable } from "./read";
import {
  ACTOR_KIND_WORDS,
  OUTCOME_WORDS,
  eventLine,
  hospitalWords,
  utc,
} from "./words";

export const EVENT_COLUMNS = [
  "Position",
  "Fingerprint",
  "Time (UTC)",
  "Who",
  "Role",
  "Kind",
  "Hospital",
  "Action type",
  "Action",
  "Target",
  "Outcome",
  "IP address",
  "Device",
  "Flags",
  "Reason",
  "Note",
  "Clearance",
  "Export",
  "Request",
  "After an integrity failure",
];
/** Named-access files add these after Action. */
const NAMED_COLUMNS = ["View", "Patients", "Patient ids"];
const ACTION = EVENT_COLUMNS.indexOf("Action");

export type AuditFileIn = {
  kind: ExportKind;
  exportId: string;
  by: Person;
  /** When it was made (ISO). */
  at: string;
  reason: ExportReason;
  note: string | null;
  reference: string | null;
  /** The filters, from `filtersInWords`. */
  filtersWords: string;
  /** Entries; for named access, each with its `pseudonyms`. */
  rows: unknown[];
  demo: boolean;
  capped: boolean;
};

const FLAG_WORDS = { security: "Security", policy: "Policy" };

/** The target, never a patient's name or id. */
function targetWords(t: AuditTarget | null): string {
  if (!t) return "";
  if (t.kind === "patient") return "A patient";
  return ("name" in t && t.name) || t.id;
}

function eventCells(e: AuditEvent): Cell[] {
  return [
    e.seq,
    e.hash,
    utc(e.at),
    e.actor.kind === "system" ? "System" : e.actor.name,
    ROLE_WORDS[e.actor.role],
    ACTOR_KIND_WORDS[e.actor.kind],
    hospitalWords(e.hospital),
    TYPE_WORDS[e.type],
    eventLine(e),
    targetWords(e.target),
    OUTCOME_WORDS[e.outcome],
    e.ip,
    e.device,
    e.flag ? FLAG_WORDS[e.flag] : null,
    e.reason ? REASON_WORDS[e.reason] : null,
    e.note,
    e.refs.clearance_id,
    e.refs.export_id,
    e.refs.request_id,
    e.after_break ? "Yes" : null,
  ];
}

function notDisplayable(r: Undisplayable, width: number): Cell[] {
  const cells: Cell[] = Array(width).fill(null);
  cells[0] = r.seq;
  cells[ACTION] = r.id ? `Not displayable · ${r.id}` : "Not displayable";
  return cells;
}

export function auditFile(f: AuditFileIn): string {
  const named = f.kind === "named_access";
  const columns = named
    ? [
        ...EVENT_COLUMNS.slice(0, ACTION + 1),
        ...NAMED_COLUMNS,
        ...EVENT_COLUMNS.slice(ACTION + 1),
      ]
    : EVENT_COLUMNS;
  const table = f.rows.map((raw): Cell[] => {
    if (!named) {
      const r = readAuditEvent(raw);
      return r.ok ? eventCells(r.event) : notDisplayable(r, columns.length);
    }
    const r = readNamedFileRow(raw);
    if (!r.ok) return notDisplayable(r, columns.length);
    const cells = eventCells(r.event);
    cells.splice(
      ACTION + 1,
      0,
      viewWords(r.event.facts.view),
      r.event.facts.patient_count ?? null,
      r.event.pseudonyms.join(";"),
    );
    return cells;
  });
  const reason = REASON_WORDS[f.reason];
  const meta: Cell[][] = [
    ...(f.demo ? [["Demo", "Sample data – not a real export"]] : []),
    ["Export id", f.exportId],
    ["Made by", f.by.name],
    ["Made at (UTC)", utc(f.at)],
    ["Reason", f.note ? `${reason} · ${f.note}` : reason],
    ["Reference", f.reference],
    ["Filters", f.filtersWords],
    ["Rows", f.rows.length],
    ["Capped", f.capped ? "Yes" : "No"],
    [],
  ];
  const [first, ...rest] = [...meta, columns, ...table];
  return toCsv(first as string[], rest);
}
