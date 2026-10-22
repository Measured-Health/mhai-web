// The platform demo's sample legal holds: one in every state. The references,
// people and reasons are invented. No patient data: a hold covers a whole
// hospital's records, or those in a date range.
import type { Person } from "./contract";
import {
  HOLD_GRACE_DAYS,
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

/**
 * Records past their retention period that a lift would make due, per
 * hospital: fixed sample counts (the backend counts them).
 */
export const RECORDS_DUE: Readonly<Record<string, number>> = {
  h_havana: 3120,
  h_northgate: 2875,
  h_riverside: 1240,
  h_eastbrook: 0,
  h_westfield: 410,
  h_harbour: 1985,
  h_southpoint: 760,
  h_lakeside: 85,
  h_hilltop: 0,
};

const TZ = "Africa/Lagos";
const HOSPITAL = {
  havana: { id: "h_havana", name: "Havana Hospital" },
  northgate: { id: "h_northgate", name: "Northgate General Hospital" },
  riverside: { id: "h_riverside", name: "Riverside Children's Hospital" },
  harbour: { id: "h_harbour", name: "Harbour View Hospital" },
  lakeside: { id: "h_lakeside", name: "Lakeside Community Clinic" },
} as const;

/** The five sample holds, newest first, each with its history. */
export function seedHolds(now: number): LegalHoldDetail[] {
  const placed = (
    id: string,
    hospital: Person,
    at: number,
    by: Person,
    rest: Pick<
      LegalHoldDetail,
      "scope" | "reason" | "reference" | "asked_by" | "note"
    >,
  ): LegalHoldDetail => ({
    id,
    hospital,
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
    hospitalId: string,
    by: Person,
    at: number,
    rest: Pick<HoldLift, "reason" | "authority" | "note">,
  ): HoldLift => ({
    id,
    kind: "hold_lift",
    requested_by: by,
    requested_at: iso(at),
    requested_by_you: false,
    expires_at: iso(at + LAPSE_DAYS * D),
    records_due: RECORDS_DUE[hospitalId] ?? 0,
    due_after: nextCleanUp(at),
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
    scope: { from: null, to: null },
    reason: "court_case",
    reference: "HC/2026/0412",
    asked_by: "Harbour View Hospital's solicitors",
    note: null,
  });

  // Northgate: its review date was yesterday.
  const reviewOn = dateIn(now - D, TZ);
  const ngAt = Date.parse(`${addMonths(reviewOn, -REVIEW_MONTHS)}T10:00:00Z`);
  const ng: LegalHoldDetail = {
    ...placed("hold_ng", HOSPITAL.northgate, ngAt, TUNDE, {
      scope: { from: "2025-01-01", to: "2025-06-30" },
      reason: "regulator",
      reference: "REG-INSP-2291",
      asked_by: "The health regulator's inspection team",
      note: null,
    }),
    review_on: reviewOn,
    status: "review_due",
  };

  // Riverside: Tunde asked to lift it 2 days ago; waiting for a second admin.
  const rcAt = now - 60 * D;
  const rcLift = lift("req_rc", "h_riverside", TUNDE, now - 2 * D, {
    reason: "case_closed",
    authority: "Counsel's letter 14 Oct 2026, ref ABC-123",
    note: null,
  });
  const rc0 = placed("hold_rc", HOSPITAL.riverside, rcAt, ADA, {
    scope: { from: null, to: null },
    reason: "complaint",
    reference: "CMP-0193",
    asked_by: "The hospital's complaints office",
    note: null,
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

  // Lakeside: lifted 3 days ago; its records are released in 4 days.
  const lcAt = now - 300 * D;
  const lc0 = placed("hold_lc", HOSPITAL.lakeside, lcAt, TUNDE, {
    scope: { from: "2024-03-01", to: null },
    reason: "investigation",
    reference: "INV-77",
    asked_by: "Lakeside Community Clinic's medical director",
    note: null,
  });
  const lc: LegalHoldDetail = {
    ...lc0,
    status: "lifted",
    lift: {
      ...lift("req_lc", "h_lakeside", TUNDE, now - 5 * D, {
        reason: "withdrawn",
        authority: "Email from the medical director, 15 Oct 2026",
        note: null,
      }),
      approved_by: ADA,
      approved_at: iso(now - 3 * D),
      released_on: iso(now - 3 * D + HOLD_GRACE_DAYS * D),
    },
    version: 3,
    history: [
      event(now - 3 * D, ADA, "lifted", LIFT_REASON_WORDS.withdrawn),
      event(now - 5 * D, TUNDE, "lift_requested", LIFT_REASON_WORDS.withdrawn),
      ...lc0.history,
    ],
  };

  // Havana: lifted 40 days ago, its records long since released.
  const hhAt = now - 250 * D;
  const hh0 = placed("hold_hh", HOSPITAL.havana, hhAt, ADA, {
    scope: { from: null, to: null },
    reason: "other",
    reference: "BRD-2026-03",
    asked_by: "Havana Hospital's board",
    note: "Board request pending legal review",
  });
  const hhApproved = now - 40 * D;
  const hhReleased = hhApproved + HOLD_GRACE_DAYS * D;
  const hh: LegalHoldDetail = {
    ...hh0,
    status: "lifted",
    lift: {
      ...lift("req_hh", "h_havana", TUNDE, now - 42 * D, {
        reason: "case_closed",
        authority: "Board minutes, 3 Sep 2026",
        note: null,
      }),
      approved_by: ADA,
      approved_at: iso(hhApproved),
      released_on: iso(hhReleased),
    },
    version: 3,
    history: [
      event(hhReleased, ADA, "released"),
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

  return [hv, ng, rc, lc, hh].sort(
    (a, b) => Date.parse(b.placed_at) - Date.parse(a.placed_at),
  );
}
