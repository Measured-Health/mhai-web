// Patient alerts and notification settings as core openapi 1.20.0 sends
// them (`AlertPageOut`, `AlertOut`, the unread count and
// `NotificationSettingsOut`), read strictly: every field core sends, of the
// type and in the range it says, and nothing else. A reply that doesn't
// match is a failed read, never a guess (secure-build: fail-closed readers).
import { z } from "zod";
import { isPatientId } from "../patient-link";

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const instant = z
  .string()
  .max(35)
  .regex(INSTANT)
  .refine((s) => !Number.isNaN(Date.parse(s)));
const text = (max: number) => z.string().max(max);
const label = text(200);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID);

const PERSON = z.strictObject({ display_name: label });

const FINDING = z.strictObject({
  name: label,
  value: text(100).nullable(),
  unit: text(40).nullable(),
  flag: z.enum(["low", "high", "abnormal"]).nullable(),
  reference_range: text(100).nullable(),
  recorded_at: instant.nullable(),
  code_system: z.enum(["loinc", "local"]),
  standardised: z.boolean(),
});

const EVIDENCE = z.strictObject({
  label,
  value: text(200).nullable(),
  recorded_at: instant.nullable(),
});

const CAUSE = z.strictObject({
  label,
  // `high` is never sent in v1.
  confidence: z.enum(["caution", "review"]),
  evidence: z.array(EVIDENCE).max(3),
});

// Core leaves out a bed or clinic it doesn't know; the app reads it as null.
const LOCATION = z.union([
  z
    .strictObject({
      kind: z.literal("admitted"),
      ward: label,
      bed: text(40).nullable().optional(),
    })
    .transform((l) => ({ ...l, bed: l.bed ?? null })),
  z
    .strictObject({
      kind: z.literal("outpatient"),
      clinic: label.nullable().optional(),
    })
    .transform((l) => ({ ...l, clinic: l.clinic ?? null })),
  z.strictObject({ kind: z.literal("emergency") }),
]);

export const ALERT_SCHEMA = z.strictObject({
  id: uuid,
  severity: z.enum(["critical", "urgent", "info"]),
  status: z.enum(["new", "handled", "dismissed"]),
  finding: FINDING,
  likely_causes: z.array(CAUSE).max(3),
  patient: z.strictObject({
    // Not in core 1.22.0's AlertOut yet (see TODO.md): optional, and only
    // ever a canonical lower-case uuid, so a malformed one fails the read.
    id: z.string().refine(isPatientId).optional(),
    full_name: label,
    // Null for a patient with no MRN.
    mrn: text(64).nullable(),
    location: LOCATION.nullable(),
  }),
  age: z.number().int().min(0).max(150).nullable(),
  sex: z.enum(["female", "male", "other", "unknown"]).nullable(),
  source_label: text(40).nullable(),
  emr_link: text(2000).nullable(),
  handled_by: PERSON.nullable(),
  handled_at: instant.nullable(),
  dismiss_reason: z
    .enum(["not_relevant", "already_known", "wrong_patient", "other"])
    .nullable(),
  created_at: instant,
  category: z.strictObject({ id: text(64), label }).nullable(),
  routing: z.strictObject({ to_you: z.boolean(), queue: z.boolean() }),
  arrived_late: z.boolean(),
  preliminary: z.boolean(),
  amended: z
    .strictObject({
      previous_value: text(100).nullable(),
      amended_at: instant.nullable(),
    })
    .nullable(),
  withdrawn: z
    .enum(["source_amended", "source_retracted", "excluded"])
    .nullable(),
});

export const ALERT_PAGE_SCHEMA = z.strictObject({
  alerts: z.array(ALERT_SCHEMA).max(100),
  next_cursor: text(512).nullable(),
  sources: z.array(text(40)).max(50),
  queue: z.boolean(),
  sources_status: z
    .array(
      z.strictObject({
        label: text(40),
        status: z.enum(["current", "behind"]),
        last_update_at: instant.nullable(),
      }),
    )
    .max(50),
  // Always null until grouped mode exists.
  grouped: z
    .strictObject({
      since: instant.optional(),
      count: z.number().int().min(0).optional(),
    })
    .nullable(),
});

export const UNREAD_COUNT_SCHEMA = z.strictObject({
  count: z.number().int().min(0),
});

export const NOTIFICATION_SETTINGS_SCHEMA = z.strictObject({
  alert_popups: z.boolean(),
  correction_popups: z.boolean(),
});
