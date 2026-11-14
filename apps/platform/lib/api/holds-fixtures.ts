// The platform demo's sample legal holds: one in every state, and one the
// provisioning command line placed. The references, people and reasons are
// invented. No patient data, and as core (openapi 1.26.0): a hold keeps all
// of a hospital's records, carries no note and no name of who asked, and a
// lift lands at once on approval.
import type { Person } from "./contract";
import {
  CLI_ID,
  LAPSE_DAYS,
  REVIEW_MONTHS,
  type HoldEvent,
  type HoldLift,
  type HoldReason,
  type LegalHoldDetail,
  type LiftReason,
} from "./holds-contract";

const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

const ADA: Person = { id: "tm_ada", name: "Ada Bakare" };
const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };

/** The calendar date (YYYY-MM-DD) at `ms` in the given time zone. */
export function dateIn(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
}
/** "2026-10-22" + 6 months → "2027-04-22" (the month's last day if shorter). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/**
 * The sample API's words for a reason, as Activity's detail carries them
 * (the server's words; the app's own labels live in lib/holds/labels.ts).
 */
export const HOLD_REASON_WORDS: Record<HoldReason, string> = {
  court_case: "Court case",
  regulator: "Regulator",
  complaint: "Complaint",
  investigation: "Investigation",
  other: "Other",
};
export const LIFT_REASON_WORDS: Record<LiftReason, string> = {
  case_closed: "Case closed",
  withdrawn: "Withdrawn",
  mistake: "Placed by mistake",
  other: "Other",
};

/** The daily clean-up runs at 01:00 UTC (02:00 in Lagos). */
const CLEAN_UP_HOUR_UTC = 1;
/** The next daily clean-up after `ms`. */
export function nextCleanUp(ms: number): string {
  const t = new Date(ms);
  t.setUTCHours(CLEAN_UP_HOUR_UTC, 0, 0, 0);
  if (t.getTime() <= ms) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}

/** Who core names as the placer of a hold the command line made. */
export const CLI_PERSON: Person = {
  id: CLI_ID,
  name: "Provisioning command line",
};

const TZ = "Africa/Lagos";
const HOSPITAL = {
  havana: { id: "h_havana", name: "Havana Hospital" },
  northgate: { id: "h_northgate", name: "Northgate General Hospital" },
  riverside: { id: "h_riverside", name: "Riverside Children's Hospital" },
  harbour: { id: "h_harbour", name: "Harbour View Hospital" },
  lakeside: { id: "h_lakeside", name: "Lakeside Community Clinic" },
  ridgeway: { id: "h_ridgeway", name: "Ridgeway General Hospital" },
} as const;
const ALL = { from: null, to: null } as const;

/** The six sample holds, newest first, each with its history. */
export function seedHolds(now: number): LegalHoldDetail[] {
  const placed = (
    id: string,
    hospital: Person,
    at: number,
    by: Person,
    rest: Pick<LegalHoldDetail, "reason" | "reference">,
  ): LegalHoldDetail => ({
    id,
    hospital,
    scope: ALL,
    asked_by: null,
    note: null,
    ...rest,
    placed_by: by,
    placed_at: iso(at),
    review_on: addMonths(dateIn(at, TZ), REVIEW_MONTHS),
    status: "active",
    lift: null,
    stopped_removal: false,
    version: 1,
    history: [{ at: iso(at), actor: by, action: "placed", detail: null }],
  });
  const lift = (
    id: string,
    by: Person,
    at: number,
    rest: Pick<HoldLift, "reason" | "authority">,
  ): HoldLift => ({
    id,
    kind: "hold_lift",
    requested_by: by,
    requested_at: iso(at),
    requested_by_you: false,
    expires_at: iso(at + LAPSE_DAYS * D),
    note: null,
    records_due: null,
    due_after: null,
    approved_by: null,
    approved_at: null,
    released_on: null,
    ...rest,
  });
  const event = (
    at: number,
    actor: Person,
    action: HoldEvent["action"],
    detail: string | null = null,
  ): HoldEvent => ({ at: iso(at), actor, action, detail });

  // Harbour View: active, blocking its Removal pending request.
  const hv = placed("hold_hv", HOSPITAL.harbour, now - 40 * D, ADA, {
    reason: "court_case",
    reference: "HC-2026-0412",
  });

  // Northgate: its review date was yesterday.
  const reviewOn = dateIn(now - D, TZ);
  const ngAt = Date.parse(`${addMonths(reviewOn, -REVIEW_MONTHS)}T10:00:00Z`);
  const ng: LegalHoldDetail = {
    ...placed("hold_ng", HOSPITAL.northgate, ngAt, TUNDE, {
      reason: "regulator",
      reference: "REG-2026-2291",
    }),
    review_on: reviewOn,
    status: "review_due",
  };

  // Riverside: Tunde asked to lift it 2 days ago; waiting for a second admin.
  const rcAt = now - 60 * D;
  const rcLift = lift("req_rc", TUNDE, now - 2 * D, {
    reason: "case_closed",
    authority: "CT-2026-0091",
  });
  const rc0 = placed("hold_rc", HOSPITAL.riverside, rcAt, ADA, {
    reason: "complaint",
    reference: "CMP-2026-0193",
  });
  const rc: LegalHoldDetail = {
    ...rc0,
    status: "lift_requested",
    lift: rcLift,
    version: 2,
    history: [
      event(
        now - 2 * D,
        TUNDE,
        "lift_requested",
        LIFT_REASON_WORDS.case_closed,
      ),
      ...rc0.history,
    ],
  };

  // Lakeside: lifted 3 days ago, at once on approval (no grace period).
  const lcAt = now - 300 * D;
  const lc0 = placed("hold_lc", HOSPITAL.lakeside, lcAt, TUNDE, {
    reason: "investigation",
    reference: "INV-2024-77",
  });
  const lc: LegalHoldDetail = {
    ...lc0,
    status: "lifted",
    lift: {
      ...lift("req_lc", TUNDE, now - 5 * D, {
        reason: "withdrawn",
        authority: "ML-2026-0015",
      }),
      approved_by: ADA,
      approved_at: iso(now - 3 * D),
      released_on: iso(now - 3 * D),
    },
    version: 3,
    history: [
      event(now - 3 * D, ADA, "lifted", LIFT_REASON_WORDS.withdrawn),
      event(now - 5 * D, TUNDE, "lift_requested", LIFT_REASON_WORDS.withdrawn),
      ...lc0.history,
    ],
  };

  // Havana: lifted 40 days ago.
  const hhAt = now - 250 * D;
  const hh0 = placed("hold_hh", HOSPITAL.havana, hhAt, ADA, {
    reason: "other",
    reference: "BRD-2026-03",
  });
  const hhApproved = now - 40 * D;
  const hh: LegalHoldDetail = {
    ...hh0,
    status: "lifted",
    lift: {
      ...lift("req_hh", TUNDE, now - 42 * D, {
        reason: "case_closed",
        authority: "BRD-2026-0903",
      }),
      approved_by: ADA,
      approved_at: iso(hhApproved),
      released_on: iso(hhApproved),
    },
    version: 3,
    history: [
      event(hhApproved, ADA, "lifted", LIFT_REASON_WORDS.case_closed),
      event(
        now - 42 * D,
        TUNDE,
        "lift_requested",
        LIFT_REASON_WORDS.case_closed,
      ),
      ...hh0.history,
    ],
  };

  // Ridgeway: placed by the provisioning command line, with no reason, over
  // a year ago: its review date (six months on) has passed.
  const sp: LegalHoldDetail = {
    ...placed("hold_rg", HOSPITAL.ridgeway, now - 400 * D, CLI_PERSON, {
      reason: null,
      reference: "LH-2025-0042",
    }),
    status: "review_due",
  };

  return [hv, ng, rc, lc, hh, sp].sort(
    (a, b) => Date.parse(b.placed_at) - Date.parse(a.placed_at),
  );
}
