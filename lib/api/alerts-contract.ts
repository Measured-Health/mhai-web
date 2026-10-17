// Patient alerts and notification settings, hand-written from Plan 5a's
// assumed contract (spec §10 item 20). To be replaced by types generated from
// the backend OpenAPI schema. EMR-agnostic (ADR 0003): the API sends MHAI's
// canonical shape with display labels; `emr_link` and `source_label` come
// from the backend as they are, and nothing here names a vendor.
import type { Sex } from "./contract";

export type AlertSeverity = "critical" | "urgent" | "info";
/** `handled` means acknowledged. The list filter uses the same three words. */
export type AlertStatus = "new" | "handled" | "dismissed";
export type FindingFlag = "low" | "high" | "abnormal";
/** The result labels' levels (spec §6): High confidence, Use with caution, Needs review. */
export type CauseConfidence = "high" | "caution" | "review";
export type DismissReason =
  "not_relevant" | "already_known" | "wrong_patient" | "other";

/** Where the patient is. Ward, bed and clinic come as display labels. An unrecorded location is `null` on the patient, never a variant. */
export type AlertLocationOut =
  | { kind: "admitted"; ward: string; bed: string | null }
  | { kind: "outpatient"; clinic: string | null }
  | { kind: "emergency" };

export interface FindingOut {
  /** Display label, e.g. "Potassium"; the source's own label when not standardised. */
  name: string;
  /** As recorded, e.g. "2.9" or "Positive". */
  value: string | null;
  /** e.g. "mmol/L". */
  unit: string | null;
  flag: FindingFlag | null;
  /** The source's reference range as given, e.g. "3.5–5.1". */
  reference_range: string | null;
  /** ISO 8601. */
  recorded_at: string | null;
  /** Kept for audit; never shown. */
  code_system: string | null;
  /** False while the source's code isn't mapped (ADR 0003): "Not standardised". */
  standardised: boolean;
}

export interface LikelyCauseOut {
  label: string;
  confidence: CauseConfidence;
}

export interface AlertPatientOut {
  full_name: string;
  /** The hospital's own MRN. */
  mrn: string;
  /** Null reads "Location not recorded". */
  location: AlertLocationOut | null;
}

export interface AlertOut {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  finding: FindingOut;
  /** At most three, strongest first. Suggestions, never a diagnosis. */
  likely_causes: LikelyCauseOut[];
  patient: AlertPatientOut;
  age: number | null;
  sex: Sex | null;
  /** The hospital's own label for the system it came from; never a vendor name. */
  source_label: string | null;
  /** Opens the patient's record in the hospital's system; built by the backend. */
  emr_link: string | null;
  /** Who acknowledged or dismissed it, and when (ISO 8601). */
  handled_by: { display_name: string } | null;
  handled_at: string | null;
  dismiss_reason: DismissReason | null;
  created_at: string;
}

export interface AlertQuery {
  status?: AlertStatus;
  severity?: AlertSeverity;
  /** One of the list's `sources`. */
  source?: string;
  cursor?: string;
  limit?: number;
}

export interface AlertPageOut {
  /** Newest first. */
  alerts: AlertOut[];
  next_cursor: string | null;
  /** The hospital's own labels for its connected systems (R10). */
  sources: string[];
}

export interface UnreadCountOut {
  /** New alerts for you that no one has handled yet (R1). */
  count: number;
}

export interface DismissIn {
  reason: DismissReason;
  /** At most 500 characters; omitted when empty. */
  note?: string;
}

/** The 409 `already_handled` reply: who handled it first, and how (R7). */
export interface AlertHandledOut {
  status: Exclude<AlertStatus, "new">;
  handled_by: { display_name: string } | null;
  handled_at: string | null;
}

export interface NotificationSettingsOut {
  alert_popups: boolean;
  correction_popups: boolean;
}
export type NotificationSettingsPatchIn = Partial<NotificationSettingsOut>;
