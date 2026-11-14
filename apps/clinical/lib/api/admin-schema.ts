// The hospital admin replies as core OpenAPI 1.24.0 sends them (`StaffOut`,
// `HospitalSettingsOut`, `HospitalUsageOut`, `HospitalActivityPage`), read
// strictly: every field core sends, of the type and in the range it says,
// and nothing else. A reply that doesn't match is a failed read, never a
// guess (secure-build: fail-closed readers). Ids stay opaque strings.
import { z } from "zod";

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const instant = z
  .string()
  .max(35)
  .regex(INSTANT)
  .refine((s) => !Number.isNaN(Date.parse(s)));
const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(64);
const label = text(200);
const count = z.number().int().min(0);
const PERSON = z.strictObject({ display_name: label });
const ROLE = z.enum(["clinician", "analyst", "hospital_admin"]);

export const STAFF_SCHEMA = z.strictObject({
  id,
  full_name: label,
  display_name: label,
  email: text(320),
  roles: z.array(ROLE).max(3),
  specialty: text(100).nullable(),
  can_review: z.boolean(),
  // Core has no reviewing by specialty yet: always empty.
  review_specialties: z.array(text(100)).max(0),
  // Core has no invites: never `invited`.
  status: z.enum(["active", "deactivated"]),
  issues: z.array(z.enum(["mfa_not_set_up"])).max(1),
  sign_in: z.enum(["sso", "password_mfa", "password"]).nullable(),
  last_active_at: instant.nullable(),
  joined_at: instant.nullable(),
  invited_at: z.null(),
  invite_expires_at: z.null(),
  is_you: z.boolean(),
  version: z.number().int().min(1),
});

export const STAFF_LIST_SCHEMA = z.array(STAFF_SCHEMA).max(5000);

export const SETTINGS_SCHEMA = z.strictObject({
  hospital_name: label,
  review_overdue_hours: z.number().int().min(0),
  reviewers_share_specialty: z.boolean(),
  require_mfa_for_clinicians: z.boolean(),
  idle_timeout_minutes: z.number().int().min(0),
  allow_trust_device: z.boolean(),
  sso: z.strictObject({
    status: z.enum(["connected", "not_set_up", "error"]),
    domain: text(255).nullable(),
  }),
  allowed_email_domains: z.array(text(255)).max(100),
  specialties: z.array(text(100)).max(500),
  limits: z.strictObject({
    review_overdue_hours: z.array(z.number().int().min(0)).max(50),
    idle_timeout_minutes: z.array(z.number().int().min(0)).max(50),
  }),
  version: z.number().int().min(1),
});

const GUARDED = z
  .strictObject({ value: count.nullable(), suppressed: z.boolean() })
  // Hidden is always `{value: null, suppressed: true}`; a shown count is never null.
  .refine((g) => (g.suppressed ? g.value === null : g.value !== null));
const set = <K extends string>(keys: readonly [K, ...K[]]) =>
  z.strictObject(
    Object.fromEntries(keys.map((k) => [k, GUARDED])) as Record<
      K,
      typeof GUARDED
    >,
  );

export const SEVERITIES = ["critical", "urgent", "info"] as const;
export const CATEGORIES = [
  "blood_chemistry",
  "blood_count",
  "kidney_function",
  "blood_gases_lactate",
  "heart_markers",
  "blood_sugar",
  "vital_signs",
  "infection_markers",
] as const;
export const ROUTES = ["queue", "named"] as const;
export const HANDLING = [
  "open",
  "acknowledged",
  "dismissed",
  "withdrawn",
] as const;

export const USAGE_ALERTS_SCHEMA = z.strictObject({
  total: GUARDED,
  by_severity: set(SEVERITIES),
  by_category: set(CATEGORIES),
  by_route: set(ROUTES),
  by_handling: set(HANDLING),
});

export const USAGE_SCHEMA = z.strictObject({
  period: z.enum(["this_month", "last_month", "last_90_days"]),
  from: instant,
  to: instant,
  consultations: count,
  active_clinicians: count,
  agreement_rate: z.number().min(0).max(1).nullable(),
  median_review_hours: z.number().min(0).nullable(),
  confidence: z.strictObject({
    high: count,
    caution: count,
    review: count,
    failed: count,
  }),
  by_specialty: z
    .array(z.strictObject({ specialty: text(100), consultations: count }))
    .max(20),
  alerts: z
    .union([
      USAGE_ALERTS_SCHEMA,
      z.strictObject({ unavailable: z.literal(true) }),
    ])
    .nullable(),
});

export const ACTIVITY_EVENT_SCHEMA = z.strictObject({
  id,
  at: instant,
  type: z.enum([
    "sign_in",
    "consultation",
    "feedback",
    "review",
    "account",
    "admin",
    "security",
  ]),
  // Unknown kinds are tolerated and shown generically.
  kind: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  actor: PERSON.nullable(),
  target: PERSON.nullable(),
  specialty: text(100).nullable(),
  confidence: z.enum(["high", "caution", "review", "failed"]).nullable(),
  // Always null from core (1.24.0).
  device: z.null(),
  count: z.null(),
  flag: z.enum(["policy", "alert"]).nullable(),
});

export const ACTIVITY_PAGE_SCHEMA = z.strictObject({
  events: z.array(ACTIVITY_EVENT_SCHEMA).max(100),
  next_cursor: text(512).nullable(),
});
