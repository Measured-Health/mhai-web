// What a hold covers and how a placement is checked.
import type { Person } from "@/lib/api/contract";
import {
  DOCUMENT_REFERENCE,
  REVIEW_MONTHS,
  placedBySystem,
  type HoldReason,
  type LegalHold,
} from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";

/** A reference's and a lift's authority's longest form (`ABCDEFGH-2026-12345678`). */
export const REFERENCE_MAX = 22;
/** What a document reference looks like, for the hint under the box. */
export const REFERENCE_HINT =
  "A document reference: 2 to 8 capital letters, the year, then a number, like LH-2026-0042.";

/** What a hold covers: always all of the hospital's records (core 1.26.0). */
export const scopeLabel = (): string => "All records";

/** "Placed by the system" for the command line's holds, else the person. */
export const placedByLabel = (h: Pick<LegalHold, "placed_by">) =>
  placedBySystem(h) ? "Placed by the system" : `Placed by ${h.placed_by.name}`;

/** A lifted hold: who lifted it and when (a lift lands at once). */
export function liftedLine(h: LegalHold): string {
  const l = h.lift;
  const who = l?.approved_by?.name;
  const at = l?.approved_at;
  return `Lifted${who ? ` by ${who}` : ""}${at ? ` · ${dateLabel(at)}` : ""}`;
}

/** A hold's status in a line: who placed an active one, and when. */
export function statusLine(h: LegalHold): string {
  switch (h.status) {
    case "active": {
      const by = placedBySystem(h)
        ? "placed by the system"
        : `placed by ${h.placed_by.name}`;
      return `Active · ${by} · ${dateLabel(h.placed_at)}`;
    }
    case "review_due":
      return `Review due · ${dateLabel(h.review_on)}`;
    case "lift_requested":
      return "Lift requested · still active";
    case "lifted":
      return liftedLine(h);
  }
}

/** Whether a reference (or a lift's authority) has core's shape. */
export const isDocumentReference = (v: string) =>
  DOCUMENT_REFERENCE.test(v.trim());

/** Today as a calendar date (YYYY-MM-DD) where the person is. */
export function todayLocal(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "2026-10-22" → "2027-04-22": six months on (the month's last day if shorter). */
export function defaultReviewOn(today: string): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + REVIEW_MONTHS, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** No dates, no note, no name: a hold keeps every record (core 1.26.0). */
export type PlaceForm = {
  hospital: Person | null;
  reason: HoldReason | "";
  reference: string;
  review_on: string;
};

/** The latest review date core takes: five years from today. */
export const latestReviewOn = (today: string) =>
  `${Number(today.slice(0, 4)) + 5}${today.slice(4)}`;

/** Each field that isn't right, with its message; empty when all is well. */
export function validatePlace(
  f: PlaceForm,
  today = todayLocal(),
): Partial<Record<keyof PlaceForm, string>> {
  const e: Partial<Record<keyof PlaceForm, string>> = {};
  if (!f.hospital) e.hospital = "Choose a hospital.";
  if (!f.reason) e.reason = "Choose a reason.";
  const ref = f.reference.trim();
  if (!ref) e.reference = "Enter the reference.";
  else if (!isDocumentReference(ref))
    e.reference = "Use a document reference, like LH-2026-0042.";
  if (!f.review_on || f.review_on <= today)
    e.review_on = "Choose a review date after today.";
  else if (f.review_on > latestReviewOn(today))
    e.review_on = "Choose a review date within 5 years.";
  return e;
}

export type EditForm = { review_on: string };

/** An edit's review date: a changed one must be after today. */
export function validateEdit(
  f: EditForm,
  h: Pick<LegalHold, "review_on">,
  today = todayLocal(),
): Partial<Record<keyof EditForm, string>> {
  const e: Partial<Record<keyof EditForm, string>> = {};
  if (!f.review_on) e.review_on = "Choose a review date.";
  else if (f.review_on !== h.review_on && f.review_on <= today)
    e.review_on = "Choose a review date after today.";
  return e;
}
