// Record connections as core openapi 1.20.0 sends them (`EmrConnectorType`,
// `EmrConnectionSummary`, `EmrConnection`, the list's `not_connected`),
// read strictly: every field core sends and nothing else. A reply that
// doesn't match is a failed read (502), never a guess. A secret is never in
// a reply: `credentials` carries only when each was set.
import { z } from "zod";
import { ApiError } from "@mhai/api-client/errors";
import type {
  ConnectionsOut,
  ConnectorType,
  EmrConnection,
} from "./emr-contract";

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const instant = z
  .string()
  .max(35)
  .regex(INSTANT)
  .refine((s) => !Number.isNaN(Date.parse(s)));
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const text = (max: number) => z.string().max(max);
const PERSON = z.strictObject({ id, name: text(200) });
const SYNC_CODE = z.enum([
  "unreachable",
  "sign_in_refused",
  "timed_out",
  "unreadable_data",
  "unmapped_codes",
  "too_many_requests",
]);

const CONNECTOR_TYPE = z.strictObject({
  id: z.enum(["fhir_r4", "document_archive", "file_export", "stub"]),
  label: text(200),
  summary: text(500),
  fields: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z_]+$/),
        label: text(200),
        kind: z.enum(["text", "secret"]),
        required: z.boolean(),
        max: z.number().int().min(1),
      }),
    )
    .max(50),
});

const SUMMARY = {
  id,
  hospital: PERSON,
  type: text(64),
  type_label: text(200),
  source_label: z.string().min(1).max(40),
  enabled: z.boolean(),
  health: z.enum(["never", "ok", "errors"]),
  last_test: z
    .strictObject({ at: instant, ok: z.boolean(), code: SYNC_CODE.nullable() })
    .nullable(),
  last_sync: z
    .strictObject({
      at: instant,
      ok: z.boolean(),
      records: z.number().int().min(0),
    })
    .nullable(),
  errors_24h: z.number().int().min(0),
  paused: z.boolean(),
  credentials_missing: z.boolean(),
};

const CONNECTION = z.strictObject({
  ...SUMMARY,
  base_url: text(500),
  settings: z.record(z.string(), text(4000)),
  credentials: z
    .array(z.strictObject({ key: text(64), set_at: instant.nullable() }))
    .max(50),
  errors: z
    .array(
      z.strictObject({
        at: instant,
        code: SYNC_CODE,
        count: z.number().int().min(1),
      }),
    )
    .max(5),
  updated_by: PERSON.nullable(),
  updated_at: instant.nullable(),
  version: z.number().int().min(1),
  poll_seconds: z.number().int().min(60).max(86_400),
  private_network: z.boolean(),
  private_cidrs: z.array(text(43)).max(8),
});

const TYPES = z.strictObject({ types: z.array(CONNECTOR_TYPE).max(20) });
const LIST = z.strictObject({
  connections: z.array(z.strictObject(SUMMARY)),
  not_connected: z.array(PERSON),
});

function read<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(502, "bad_gateway");
  return r.data;
}

export const readConnectorTypes = (d: unknown): { types: ConnectorType[] } =>
  read(TYPES, d);
export const readConnections = (d: unknown): ConnectionsOut => read(LIST, d);
export const readConnection = (d: unknown): EmrConnection =>
  read(CONNECTION, d);
