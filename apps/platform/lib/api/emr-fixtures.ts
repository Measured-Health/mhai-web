// The sample record connections (Plan 13, spec §6). Every hospital, address
// and setting is invented; types are named by standard or method, never by
// product. Times are relative to `now`. No patient data, and no credential:
// the sample stores only when each one was set.
import type { Person } from "./contract";
import type {
  ConnectionHealth,
  ConnectorType,
  SyncError,
  SyncErrorCode,
} from "./emr-contract";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

const ADA: Person = { id: "tm_ada", name: "Ada Bakare" };
const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };

const text = (key: string, label: string, max = 200) =>
  ({ key, label, kind: "text", required: true, max }) as const;
const secret = (key: string, label: string) =>
  ({ key, label, kind: "secret", required: true, max: 4000 }) as const;

export const CONNECTOR_TYPES: ConnectorType[] = [
  {
    id: "fhir_r4",
    label: "FHIR R4 server",
    summary: "Reads records from a FHIR R4 server",
    fields: [
      text("client_id", "Client ID"),
      secret("private_key", "Private key"),
    ],
  },
  {
    id: "hl7v2_feed",
    label: "Results message feed",
    summary: "Receives results messages as they are sent",
    fields: [
      text("sender_id", "Sending system ID"),
      secret("shared_key", "Shared key"),
    ],
  },
  {
    id: "file_export",
    label: "Scheduled file export",
    summary: "Collects an export file from a secure folder",
    fields: [text("folder", "Folder"), secret("access_key", "Access key")],
  },
];

/**
 * A connection as the sample API keeps it: what it returns, without the
 * computed parts (the type's label, the last 24 hours' errors). Credentials
 * themselves are never here; the mock keeps those apart.
 */
export type ConnectionRecord = {
  id: string;
  hospital_id: string;
  type: string;
  source_label: string;
  base_url: string;
  settings: Record<string, string>;
  /** When each secret field was set, by key; null when not set. */
  credentials_set: Record<string, string | null>;
  enabled: boolean;
  /** Whether it has ever synced; problems in the last 24 h make "errors". */
  synced: boolean;
  last_test: { at: string; ok: boolean; code: SyncErrorCode | null } | null;
  last_sync: { at: string; ok: boolean; records: number } | null;
  /** Every problem kept, newest first; replies show the last 24 hours. */
  errors: SyncError[];
  updated_by: Person | null;
  updated_at: string | null;
  version: number;
  /**
   * What Test connection finds, fixed by the sample: null passes unless
   * the address contains "fail" or a required secret isn't set.
   */
  test_result: SyncErrorCode | null;
};

export function seedConnections(now: number): ConnectionRecord[] {
  return [
    {
      id: "emr_hv1",
      hospital_id: "h_havana",
      type: "fhir_r4",
      source_label: "Main record",
      base_url: "https://records.havana.example/fhir",
      settings: { client_id: "mhai-havana" },
      credentials_set: { private_key: iso(now - 30 * D) },
      enabled: true,
      synced: true,
      last_test: { at: iso(now - 30 * D), ok: true, code: null },
      last_sync: { at: iso(now - 2 * MIN), ok: true, records: 1284 },
      errors: [],
      updated_by: ADA,
      updated_at: iso(now - 30 * D),
      version: 3,
      test_result: null,
    },
    {
      id: "emr_hv2",
      hospital_id: "h_havana",
      type: "hl7v2_feed",
      source_label: "Results system",
      base_url: "https://records.havana.example/results-feed",
      settings: { sender_id: "HAVANA_LAB" },
      credentials_set: { shared_key: iso(now - 45 * D) },
      enabled: true,
      synced: true,
      last_test: { at: iso(now - 45 * D), ok: true, code: null },
      last_sync: { at: iso(now - MIN), ok: true, records: 312 },
      errors: [],
      updated_by: TUNDE,
      updated_at: iso(now - 45 * D),
      version: 2,
      test_result: null,
    },
    {
      // Its sign-in started failing this morning: the hospital changed the
      // key on its side. A test fails the same way.
      id: "emr_ng1",
      hospital_id: "h_northgate",
      type: "fhir_r4",
      source_label: "Patient record",
      base_url: "https://records.northgate.example/fhir",
      settings: { client_id: "mhai-northgate" },
      credentials_set: { private_key: iso(now - 90 * D) },
      enabled: true,
      synced: true,
      last_test: { at: iso(now - 90 * D), ok: true, code: null },
      last_sync: { at: iso(now - 6 * H), ok: true, records: 864 },
      errors: [{ at: iso(now - 25 * MIN), code: "sign_in_refused", count: 3 }],
      updated_by: ADA,
      updated_at: iso(now - 90 * D),
      version: 2,
      test_result: "sign_in_refused",
    },
    {
      id: "emr_rc1",
      hospital_id: "h_riverside",
      type: "file_export",
      source_label: "Nightly export",
      base_url: "https://records.riverside.example/exports",
      settings: { folder: "/outgoing/mhai" },
      credentials_set: { access_key: iso(now - 120 * D) },
      enabled: false,
      synced: true,
      last_test: { at: iso(now - 120 * D), ok: true, code: null },
      last_sync: { at: iso(now - 5 * D - 3 * H), ok: true, records: 96 },
      errors: [],
      updated_by: ADA,
      updated_at: iso(now - 5 * D),
      version: 4,
      test_result: null,
    },
    {
      // Added an hour ago; the private key isn't set yet, so a test fails
      // until it is.
      id: "emr_wf1",
      hospital_id: "h_westfield",
      type: "fhir_r4",
      source_label: "Main record",
      base_url: "https://records.westfield.example/fhir",
      settings: { client_id: "mhai-westfield" },
      credentials_set: { private_key: null },
      enabled: false,
      synced: false,
      last_test: null,
      last_sync: null,
      errors: [],
      updated_by: TUNDE,
      updated_at: iso(now - H),
      version: 1,
      test_result: null,
    },
  ];
}

/** "errors" with problems in the last 24 hours, else whether it has synced. */
export const healthOf = (synced: boolean, recent: number): ConnectionHealth =>
  recent > 0 ? "errors" : synced ? "ok" : "never";
