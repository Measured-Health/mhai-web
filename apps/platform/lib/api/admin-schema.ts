// The platform admin replies as core sends them (openapi 1.25.0 for the
// hospitals list and page, 1.26.0 for the team, activity, legal holds and
// the analytics e-mail), read strictly: every field core sends, of the type
// and in the range it says, and nothing else. A reply that doesn't match is
// a failed read (502 `bad_gateway`), never a guess.
//
// Where core sends less than the old frontend contract, the schema pins it:
// a hold keeps every record (scope both null), carries no note and no
// "asked by" (both null), and a lift has no grace period (`records_due` and
// `due_after` null). A hospital has no country, domains, deactivation,
// invite or removal record in core (empty or null).
import { z } from "zod";
import { ApiError } from "@mhai/api-client/errors";
import type {
  ActivityEvent,
  Hospital,
  HospitalSummary,
  TeamMember,
} from "./contract";
import type { LegalHold, LegalHoldDetail } from "./holds-contract";
import type { EmailPref } from "./notifications-contract";

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const instant = z
  .string()
  .max(35)
  .regex(INSTANT)
  .refine((s) => !Number.isNaN(Date.parse(s)));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = z
  .string()
  .regex(DAY)
  .refine((s) => {
    const t = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(s);
  });
/** A uuid, or core's "cli" for the provisioning command line. */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const text = (max: number) => z.string().max(max);
const version = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cursor = z.string().max(1024).nullable();
const PERSON = z.strictObject({ id, name: text(200) });
const REFERENCE = z.string().regex(/^[A-Z]{2,8}-[0-9]{4}-[0-9]{2,8}$/);
const ALL_RECORDS = z.strictObject({ from: z.null(), to: z.null() });
const HOLD_REASON = z.enum([
  "court_case",
  "regulator",
  "complaint",
  "investigation",
  "other",
]);

const TEAM_MEMBER = z.strictObject({
  id,
  name: text(200),
  email: text(320),
  role: z.enum(["platform_admin", "auditor"]),
  status: z.enum(["active", "invite_pending"]),
  mfa_enabled: z.boolean(),
  last_sign_in_at: instant.nullable(),
  is_you: z.boolean(),
  version,
});
const TEAM = z.strictObject({ members: z.array(TEAM_MEMBER).max(1000) });

/** An action is a code; one this app has no words for is shown as it is. */
const ACTIVITY_EVENT = z.strictObject({
  id: text(64),
  at: instant,
  // Only actions taken by a person: never null.
  actor: PERSON,
  action: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  hospital: PERSON.nullable(),
  target: text(500).nullable(),
  detail: text(500).nullable(),
});
const ACTIVITY_PAGE = z.strictObject({
  events: z.array(ACTIVITY_EVENT).max(100),
  next_cursor: cursor,
});

const LIFT = z.strictObject({
  id,
  kind: z.literal("hold_lift"),
  requested_by: PERSON,
  requested_at: instant,
  reason: z.enum(["case_closed", "withdrawn", "mistake", "other"]),
  requested_by_you: z.boolean(),
  expires_at: instant,
  note: z.null(),
  authority: REFERENCE,
  records_due: z.null(),
  due_after: z.null(),
  approved_by: PERSON.nullable(),
  approved_at: instant.nullable(),
  released_on: instant.nullable(),
});
const HOLD_FIELDS = {
  id,
  hospital: PERSON,
  scope: ALL_RECORDS,
  // Null for a hold the provisioning command line placed.
  reason: HOLD_REASON.nullable(),
  reference: REFERENCE,
  asked_by: z.null(),
  note: z.null(),
  placed_by: PERSON,
  placed_at: instant,
  review_on: day,
  status: z.enum(["active", "review_due", "lift_requested", "lifted"]),
  lift: LIFT.nullable(),
  stopped_removal: z.boolean(),
  version,
};
const HOLD = z.strictObject(HOLD_FIELDS);
const HOLD_DETAIL = z.strictObject({
  ...HOLD_FIELDS,
  history: z
    .array(
      z.strictObject({
        at: instant,
        actor: PERSON,
        action: z.enum([
          "placed",
          "lift_requested",
          "lift_cancelled",
          "lifted",
        ]),
        detail: text(500).nullable(),
      }),
    )
    .max(1000),
});
const HOLDS_PAGE = z.strictObject({
  holds: z.array(HOLD).max(100),
  next_cursor: cursor,
});

const EMAIL_PREF = z.strictObject({
  mode: z.enum(["off", "critical", "critical_and_digest"]),
  version,
});

const HOSPITAL_STATUS = z.enum([
  "active",
  "setup_incomplete",
  "deactivated",
  "removal_pending",
  "removal_scheduled",
  "removed",
]);
const SUMMARY_FIELDS = {
  id,
  name: text(200),
  short_code: text(16),
  status: HOSPITAL_STATUS,
  staff_count: count,
  // Always false: core keeps no single sign-on per hospital.
  sso_enabled: z.literal(false),
  created_at: instant,
  last_activity_at: instant.nullable(),
  legal_holds_active: count,
};
const HOSPITAL_SUMMARY = z.strictObject(SUMMARY_FIELDS);
const HOSPITALS_PAGE = z.strictObject({
  hospitals: z.array(HOSPITAL_SUMMARY).max(50),
  next_cursor: cursor,
});
const HOSPITAL = z.strictObject({
  ...SUMMARY_FIELDS,
  // Core keeps none of these.
  country: z.literal(""),
  time_zone: text(64),
  email_domains: z.array(z.string()).max(0),
  version,
  deactivation: z.null(),
  first_admin: z.null(),
  removal: z.null(),
  admins: z
    .array(z.strictObject({ name: text(200), email: text(320) }))
    .max(1000),
  legal_holds: z
    .array(
      z.strictObject({
        id,
        scope: ALL_RECORDS,
        reference: REFERENCE,
        status: z.enum(["active", "review_due"]),
        review_on: day,
      }),
    )
    .max(1000),
});

function read<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(502, "bad_gateway");
  return r.data;
}

export const readTeam = (d: unknown): { members: TeamMember[] } =>
  read(TEAM, d);
export const readTeamMember = (d: unknown): TeamMember => read(TEAM_MEMBER, d);
export const readActivity = (
  d: unknown,
): { events: ActivityEvent[]; next_cursor: string | null } =>
  read(ACTIVITY_PAGE, d) as {
    events: ActivityEvent[];
    next_cursor: string | null;
  };
export const readHolds = (
  d: unknown,
): { holds: LegalHold[]; next_cursor: string | null } => read(HOLDS_PAGE, d);
export const readHold = (d: unknown): LegalHoldDetail => read(HOLD_DETAIL, d);
export const readEmailPref = (d: unknown): EmailPref => read(EMAIL_PREF, d);
export const readHospitals = (
  d: unknown,
): { hospitals: HospitalSummary[]; next_cursor: string | null } =>
  read(HOSPITALS_PAGE, d);
export const readHospital = (d: unknown): Hospital => read(HOSPITAL, d);
