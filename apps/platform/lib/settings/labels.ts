// The one place the settings codes become words (UI design v3 §6). A value
// not listed here is never shown raw: the block that holds it fails closed.
import {
  NOT_READY_REASONS,
  RETENTION_TYPES,
  type NotReadyReason,
  type RetentionItem,
  type RetentionType,
  type SettingsRequest,
} from "@/lib/api/settings-contract";
import { daysLabel } from "./rules";

const RETENTION_TYPE: Record<RetentionType, string> = {
  records: "Questions and answers",
  documents: "Documents",
  pending_corrections: "Waiting corrections",
  audit_log: "Audit log",
};
const NOT_READY: Record<NotReadyReason, string> = {
  missing_report: "Not ready: the validation report is missing",
  missing_files: "Not ready: the scoring files are missing",
  checksum_mismatch:
    "Not ready: the scoring files don't match their validation report",
};

/** A code this app doesn't know is never shown raw. */
function word<K extends string>(t: Record<K, string>, k: string): string {
  if (!Object.hasOwn(t, k)) throw new Error("Unknown settings value");
  return t[k as K];
}

export const retentionTypeLabel = (t: RetentionType) => word(RETENTION_TYPE, t);
export const notReadyLabel = (r: NotReadyReason) => word(NOT_READY, r);

/** "Questions and answers to 3 years" or "Triage on". */
export function requestLabel(r: SettingsRequest): string {
  if (r.kind === "triage_on") return "Triage on";
  if (r.kind === "retention_shorten")
    return `${retentionTypeLabel(r.type)} to ${daysLabel(r.to)}`;
  throw new Error("Unknown settings value");
}

/** Whether this app has words for a retention row. */
export const retentionIsKnown = (i: RetentionItem) =>
  RETENTION_TYPES.includes(i.type);

/** Whether this app has words for a waiting request. */
export const requestIsKnown = (r: SettingsRequest) =>
  r.kind === "triage_on" ||
  (r.kind === "retention_shorten" && RETENTION_TYPES.includes(r.type));

/** Whether this app has words for triage's not-ready reason (if any). */
export const notReadyIsKnown = (r: NotReadyReason | null) =>
  r === null || NOT_READY_REASONS.includes(r);
