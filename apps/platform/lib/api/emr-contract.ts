// Patient record connections (Plan 13, spec §5 and §8): how MHAI reads each
// hospital's record systems. Types are named by standard or method only,
// never by product (ADR 0003). Credentials are write-only: they are sent
// once and never come back; a reply says only when each was set.
import type { Person, StepUp, WriteOpts } from "./contract";

/** One field a connection type declares; the form renders it as given. */
export type ConnectorField = {
  /** `[a-z_]+`. */
  key: string;
  label: string;
  /** A secret is write-only: never sent back, shown as "Set · {date}". */
  kind: "text" | "secret";
  required: boolean;
  max: number;
};
/** A kind of connection, as data: a new one needs no new screen. */
export type ConnectorType = {
  id: string;
  label: string;
  summary: string;
  fields: ConnectorField[];
};

/** The closed list of sync problems; anything else reads the fallback. */
export type SyncErrorCode =
  | "unreachable"
  | "sign_in_refused"
  | "timed_out"
  | "unreadable_data"
  | "unmapped_codes"
  | "too_many_requests";
export const SYNC_ERROR_CODES: readonly SyncErrorCode[] = [
  "unreachable",
  "sign_in_refused",
  "timed_out",
  "unreadable_data",
  "unmapped_codes",
  "too_many_requests",
];
/** A problem's time and how many times it happened; never server text. */
export type SyncError = { at: string; code: SyncErrorCode; count: number };
export type ConnectionHealth = "never" | "ok" | "errors";

export type EmrConnectionSummary = {
  id: string;
  hospital: Person;
  type: string;
  type_label: string;
  /** The name the hospital sees, e.g. "Main record". */
  source_label: string;
  enabled: boolean;
  health: ConnectionHealth;
  last_test: { at: string; ok: boolean; code: SyncErrorCode | null } | null;
  last_sync: { at: string; ok: boolean; records: number } | null;
  /** Errors in the last 24 hours, summed. */
  errors_24h: number;
};
export type EmrConnection = EmrConnectionSummary & {
  base_url: string;
  /** The type's text fields only. Secrets are never here. */
  settings: Record<string, string>;
  /** One per secret field; `set_at` null when not set. */
  credentials: { key: string; set_at: string | null }[];
  /** Newest first, at most 5, last 24 hours. */
  errors: SyncError[];
  updated_by: Person | null;
  updated_at: string | null;
  version: number;
};

/** What the screens show, from `connectionState` (lib/emr/state.ts). */
export type ConnectionState =
  "not_tested" | "connected" | "needs_attention" | "off";
export type ConnectionsQuery = {
  hospital?: string;
  state?: "all" | "needs_attention" | "off" | "not_connected";
};
export type ConnectionsOut = {
  connections: EmrConnectionSummary[];
  /** Hospitals (not removed) with no connection at all. */
  not_connected: Person[];
};

export type ConnectionIn = {
  type: string;
  source_label: string; // 1–40
  base_url: string; // https only, ≤ 500
  settings: Record<string, string>;
  credentials: Record<string, string>; // secret fields, each 1–4000
} & StepUp;
export type ConnectionPatch = {
  source_label?: string;
  base_url?: string;
  settings?: Record<string, string>;
  /** Only the ones being replaced. */
  credentials?: Record<string, string>;
  version: number;
} & StepUp;

export interface EmrClient {
  listConnectorTypes(): Promise<{ types: ConnectorType[] }>;
  listConnections(q: ConnectionsQuery): Promise<ConnectionsOut>;
  getConnection(id: string): Promise<EmrConnection>;
  addConnection(
    hospitalId: string,
    body: ConnectionIn,
    opts: WriteOpts,
  ): Promise<EmrConnection>;
  updateConnection(
    id: string,
    body: ConnectionPatch,
    opts: WriteOpts,
  ): Promise<EmrConnection>;
  /** 409 `not_tested` when switching on without a passing test. */
  setConnectionEnabled(
    id: string,
    body: { enabled: boolean; version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<EmrConnection>;
  testConnection(id: string, opts: WriteOpts): Promise<EmrConnection>;
}

export const SOURCE_LABEL_MAX = 40;
export const BASE_URL_MAX = 500;
export const SECRET_MAX = 4000;
