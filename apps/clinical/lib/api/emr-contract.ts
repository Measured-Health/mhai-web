// Alert settings for hospital admins (Plan 13, spec §8 → backend §12),
// hand-written until types are generated from the backend OpenAPI schema.
// EMR-agnostic (ADR 0003): the hospital side sees status only, by the
// hospital's own labels. Never an address, a connection type, a credential
// or an error code; nothing here names a vendor.
import type { WriteOpts } from "./contract";

export type RecordsStatus = "connected" | "problems" | "off" | "not_connected";

export interface RecordsSourceOut {
  /** The hospital's own label, e.g. "Main record". */
  label: string;
  status: Exclude<RecordsStatus, "not_connected">;
  /** ISO 8601; null before the first update. */
  last_update_at: string | null;
}

export interface RecordsConnectionOut {
  /** The worst of the sources; `not_connected` when there are none. */
  status: RecordsStatus;
  sources: RecordsSourceOut[];
}

export type UnitKind = "ward" | "clinic" | "emergency" | "other";

export interface UnitOut {
  id: string;
  /** e.g. "Ward 3", "Cardiology clinic". */
  label: string;
  kind: UnitKind;
  source_label: string | null;
  covered: boolean;
}

export type FlagLevel = "off" | "critical" | "critical_urgent" | "all";

export interface CategoryOut {
  id: string;
  /** e.g. "Blood chemistry". */
  label: string;
  /** e.g. "Potassium, sodium, calcium". */
  example: string | null;
  level: FlagLevel;
}

export interface RecipientsOut {
  /** The hospital queue: a shared list every clinician can see. */
  queue: boolean;
  clinicians: { id: string; display_name: string; specialty: string | null }[];
}

export interface AlertSettingsOut {
  connection: RecordsConnectionOut;
  units: UnitOut[];
  categories: CategoryOut[];
  recipients: RecipientsOut;
  updated_by: { display_name: string } | null;
  updated_at: string | null;
  version: number;
}

/**
 * One section per save, with the version it was read at. The hospital and
 * the person saving come from the session, never from here.
 */
export type AlertSettingsPatchIn = { version: number } & (
  | { units: { covered: string[] } }
  | { rules: { levels: Record<string, FlagLevel> } }
  | { recipients: { queue: boolean; clinician_ids: string[] } }
);

/** The hospital admin's alert settings calls. Scoped to one hospital. */
export interface EmrClient {
  getAlertSettings(): Promise<AlertSettingsOut>;
  /** 422 `no_recipients`; 409 `conflict` on a stale version. */
  updateAlertSettings(
    p: AlertSettingsPatchIn,
    opts?: WriteOpts,
  ): Promise<AlertSettingsOut>;
}

export const FLAG_LEVELS: readonly FlagLevel[] = [
  "off",
  "critical",
  "critical_urgent",
  "all",
];
