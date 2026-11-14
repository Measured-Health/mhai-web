// Legal holds as the platform client sees them (spec §4 and §9, Plan 8a),
// on core's contract (openapi 1.26.0). A hold keeps every record of one
// hospital past its retention period and through any removal, until it is
// lifted by two platform admins. It carries no free text and no names: a
// note and who asked read back null. Hold dates are calendar dates
// (YYYY-MM-DD); every other time is a full timestamp.
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

/** A lift request lapses this many days after it was made. */
export const LAPSE_DAYS = 7;
/** The review date's default: this many months after placing. */
export const REVIEW_MONTHS = 6;

/** The two-person request to lift a hold, and what follows its approval. */
export type HoldLift = TwoPersonRequest & {
  kind: "hold_lift";
  reason: LiftReason;
  /** Always null: no free text. */
  note: null;
  /** The document that allows the lift, as a reference (`CT-2026-0091`). */
  authority: string;
  /** Always null: core doesn't count the records a lift makes due. */
  records_due: null;
  due_after: null;
  approved_by: Person | null;
  approved_at: string | null;
  /** The approval itself: a lift lands at once, with no grace period. */
  released_on: string | null;
};

export type LegalHold = {
  id: string;
  hospital: Person;
  /** Always both null: a hold keeps every record. */
  scope: { from: null; to: null };
  /** Null for a hold the provisioning command line placed. */
  reason: HoldReason | null;
  /** A document reference, e.g. `LH-2026-0042`. */
  reference: string;
  /** Always null: no names. */
  asked_by: null;
  /** Always null: no free text. */
  note: null;
  /** `id` "cli" for a hold the provisioning command line placed. */
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
  action: "placed" | "lift_requested" | "lift_cancelled" | "lifted";
  detail: string | null;
};
/** A hold with its history, newest first. */
export type LegalHoldDetail = LegalHold & { history: HoldEvent[] };
/** A hold as a hospital lists it: only an open one that keeps records. */
export type HoldShort = Pick<LegalHold, "id" | "scope" | "reference"> & {
  status: "active" | "review_due";
  review_on: string;
};

export type HoldQuery = {
  status?: HoldStatusFilter;
  hospital?: string;
  /** Part of the reference, any case. */
  q?: string;
  cursor?: string;
};
/** No `from`, `to`, `note` or `asked_by`: core refuses them (422). */
export type PlaceHoldIn = {
  hospital_id: string;
  reason: HoldReason;
  reference: string;
  review_on: string;
} & StepUp;

/** A hold's reference, and a lift's authority: a document reference. */
export const DOCUMENT_REFERENCE = /^[A-Z]{2,8}-[0-9]{4}-[0-9]{2,8}$/;
/** The id core gives the provisioning command line as a hold's placer. */
export const CLI_ID = "cli";

export interface HoldsClient {
  /** Newest first; `status` defaults to `open`. */
  listHolds(
    q: HoldQuery,
  ): Promise<{ holds: LegalHold[]; next_cursor: string | null }>;
  getHold(id: string): Promise<LegalHoldDetail>;
  /** 409 `hospital_removed`, `conflict` (an open hold has the reference). */
  placeHold(body: PlaceHoldIn, opts: WriteOpts): Promise<LegalHoldDetail>;
  /** Not served by core yet: 501 `not_implemented`. */
  editHold(
    id: string,
    body: { review_on?: string; version: number },
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
  requestLift(
    id: string,
    body: { reason: LiftReason; authority: string } & StepUp,
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
  /** Not served by core: a lift lands at once (501 `not_implemented`). */
  undoLift(
    id: string,
    body: { version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<LegalHoldDetail>;
}

/** A hold as a hospital lists it (a lift requested is still active). */
export const shortHold = (h: LegalHold): HoldShort => ({
  id: h.id,
  scope: h.scope,
  reference: h.reference,
  status: h.status === "review_due" ? "review_due" : "active",
  review_on: h.review_on,
});

/** Every hold keeps records until it is lifted: a lift lands at once. */
export const keepsRecords = (h: LegalHold): boolean => h.status !== "lifted";

/** Placed by the provisioning command line, not a person in the app. */
export const placedBySystem = (h: Pick<LegalHold, "placed_by">) =>
  h.placed_by.id === CLI_ID;
