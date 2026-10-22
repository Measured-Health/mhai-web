// The words for legal holds: the one place a hold's codes become text.
import {
  HOLD_REASONS,
  HOLD_STATUSES,
  type HoldReason,
  type HoldStatus,
  type HoldStatusFilter,
  type LegalHold,
  type LiftReason,
} from "@/lib/api/holds-contract";

const HOLD_REASON: Record<HoldReason, string> = {
  court_case: "Court case or claim",
  regulator: "Regulator or inspector request",
  complaint: "Complaint",
  investigation: "Internal investigation",
  other: "Other",
};
const LIFT_REASON: Record<LiftReason, string> = {
  case_closed: "The case is closed",
  withdrawn: "The request was withdrawn",
  mistake: "Placed by mistake",
  other: "Other",
};
const HOLD_STATUS: Record<HoldStatus, string> = {
  active: "Active",
  review_due: "Review due",
  lift_requested: "Lift requested",
  lifted: "Lifted",
};
const FILTER: Record<HoldStatusFilter, string> = {
  open: "Open",
  ...HOLD_STATUS,
  all: "All",
};

/** A code this app doesn't know is never shown raw. */
function word<K extends string>(t: Record<K, string>, k: string): string {
  if (!Object.hasOwn(t, k)) throw new Error("Unknown legal hold value");
  return t[k as K];
}

export const holdReasonLabel = (r: HoldReason) => word(HOLD_REASON, r);
export const liftReasonLabel = (r: LiftReason) => word(LIFT_REASON, r);
export const holdStatusLabel = (s: HoldStatus) => word(HOLD_STATUS, s);
export const holdFilterLabel = (s: HoldStatusFilter) => word(FILTER, s);

/** The filter's choices, in the order they are offered. */
export const HOLD_FILTERS: readonly HoldStatusFilter[] = [
  "open",
  "active",
  "review_due",
  "lift_requested",
  "lifted",
  "all",
];

/** Whether every code on a hold is one this app has words for. */
export const holdIsKnown = (h: LegalHold) =>
  HOLD_REASONS.includes(h.reason) && HOLD_STATUSES.includes(h.status);

export const HOLD_HINT =
  "Don't include patient names, hospital numbers or dates of birth.";
