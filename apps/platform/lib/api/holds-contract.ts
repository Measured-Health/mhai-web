// Legal holds as the platform client sees them (spec §4 and §9, Plan 8a).
// A hold keeps one hospital's records, all of them or those in a date
// range, past their retention period and through any removal, until it is
// lifted by two platform admins. Hold dates are calendar dates (YYYY-MM-DD);
// every other time is a full timestamp.
import type { Person, StepUp, TwoPersonRequest, WriteOpts } from "./contract";

export type HoldReason =
  "court_case" | "regulator" | "complaint" | "investigation" | "other";
export type HoldStatus = "active" | "review_due" | "lift_requested" | "lifted";
/** `open` is active, review due and lift requested: the list's default. */
export type HoldStatusFilter = "open" | HoldStatus | "all";
export type LiftReason = "case_closed" | "withdrawn" | "mistake" | "other";

export const HOLD_REASONS: readonly HoldReason[] = [
  "court_case",
  "regulator",
  "complaint",
  "investigation",
  "other",
];
export const HOLD_STATUSES: readonly HoldStatus[] = [
  "active",
  "review_due",
  "lift_requested",
  "lifted",
];
export const LIFT_REASONS: readonly LiftReason[] = [
  "case_closed",
  "withdrawn",
  "mistake",
  "other",
];

/** A lifted hold keeps its records this many more days. */
export const HOLD_GRACE_DAYS = 7;
/** A lift request lapses this many days after it was made. */
export const LAPSE_DAYS = 7;
/** The review date's default: this many months after placing. */
export const REVIEW_MONTHS = 6;

/** The two-person request to lift a hold, and what follows its approval. */
export type HoldLift = TwoPersonRequest & {
  kind: "hold_lift";
  reason: LiftReason;
  note: string | null;
  /** Who or what allows the lift, e.g. "Counsel's letter 14 Oct 2026". */
  authority: string;
  /** Records already past their retention period that only this hold keeps. */
  records_due: number;
  /** The clean-up after which they would be deleted. */
  due_after: string;
  approved_by: Person | null;
  approved_at: string | null;
  /** Approval + 7 days: until then the records stay kept and it can be undone. */
  released_on: string | null;
};

export type LegalHold = {
  id: string;
  hospital: Person;
  /** Both null: all records. `to` null: from `from` until lifted. Inclusive. */
  scope: { from: string | null; to: string | null };
  reason: HoldReason;
  reference: string;
  asked_by: string;
  note: string | null;
  placed_by: Person;
  placed_at: string;
  review_on: string;
  status: HoldStatus;
  lift: HoldLift | null;
  /** Placing it sent a scheduled removal back to Removal pending. */
  stopped_removal: boolean;
  version: number;
};

export type HoldEvent = {
  at: string;
  actor: Person;
  action:
    | "placed"
    | "edited"
    | "lift_requested"
    | "lift_cancelled"
    | "lift_lapsed"
    | "lifted"
    | "lift_undone"
    | "released";
  detail: string | null;
};
/** A hold with its history, newest first. */
export type LegalHoldDetail = LegalHold & { history: HoldEvent[] };
/** A hold as a hospital lists it. */
export type HoldShort = Pick<
  LegalHold,
  "id" | "scope" | "reference" | "status" | "review_on"
>;

export type HoldQuery = {
  status?: HoldStatusFilter;
  hospital?: string;
  /** Part of the reference, any case. */
  q?: string;
  cursor?: string;
};
export type PlaceHoldIn = {
  hospital_id: string;
  from?: string;
  to?: string;
  reason: HoldReason;
  note?: string;
  reference: string;
  asked_by: string;
  review_on: string;
} & StepUp;

export interface HoldsClient {
  /** Newest first; `status` defaults to `open`. */
  listHolds(
    q: HoldQuery,
  ): Promise<{ holds: LegalHold[]; next_cursor: string | null }>;
  getHold(id: string): Promise<LegalHoldDetail>;
  /** 409 `hospital_removed` or `removal_started`; 422 `invalid_range`. */
  placeHold(body: PlaceHoldIn, opts: WriteOpts): Promise<LegalHoldDetail>;
  /** The review date and the note only; no step-up. */
  editHold(
    id: string,
    body: { review_on?: string; note?: string | null; version: number },
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
  requestLift(
    id: string,
    body: { reason: LiftReason; note?: string; authority: string } & StepUp,
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
  /**
   * Approve, cancel and undo send the hold's `version` as the person saw it:
   * they act only on that request, else 409 `conflict` ("Changed by someone
   * else"). Approve: 409 `same_person` for the requester; 409 `expired` once
   * it lapsed.
   */
  approveLift(
    id: string,
    body: { version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
  /** Either platform admin; no step-up. */
  cancelLift(
    id: string,
    body: { version: number },
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
  /** Only before `released_on`; 409 `conflict` after. */
  undoLift(
    id: string,
    body: { version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
}

/** A hold as a hospital lists it. */
export const shortHold = (h: LegalHold): HoldShort => ({
  id: h.id,
  scope: h.scope,
  reference: h.reference,
  status: h.status,
  review_on: h.review_on,
});

/** Active, review due, lift requested, or lifted before released_on. */
export function keepsRecords(h: LegalHold, now: number): boolean {
  if (h.status !== "lifted") return true;
  const until = h.lift?.released_on;
  return !!until && now < Date.parse(until);
}
