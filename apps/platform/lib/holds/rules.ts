// What a hold covers and how a placement is checked.
import type { Person } from "@/lib/api/contract";
import {
  REVIEW_MONTHS,
  type HoldReason,
  type LegalHold,
} from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";

export const REFERENCE_MAX = 100;
export const ASKED_BY_MAX = 200;
export const NOTE_MAX = 500;

/** "All records", "Records from 1 Jan 2025 to 30 Jun 2025", or "…, until lifted". */
export function scopeLabel(scope: LegalHold["scope"]): string {
  if (!scope.from) return "All records";
  const from = `Records from ${dateLabel(scope.from)}`;
  return scope.to
    ? `${from} to ${dateLabel(scope.to)}`
    : `${from}, until lifted`;
}

/**
 * A lifted hold: until its records are released it says so; after that,
 * who lifted it and when.
 */
export function liftedLine(h: LegalHold, now: number): string {
  const l = h.lift;
  const until = l?.released_on;
  if (until && now < Date.parse(until))
    return `Lifted · records released on ${dateLabel(until)}`;
  const who = l?.approved_by?.name;
  const at = l?.approved_at;
  return `Lifted${who ? ` by ${who}` : ""}${at ? ` · ${dateLabel(at)}` : ""}`;
}

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

export type PlaceForm = {
  hospital: Person | null;
  scope: "all" | "dates";
  from: string;
  to: string;
  reason: HoldReason | "";
  reference: string;
  asked_by: string;
  note: string;
  review_on: string;
};

const over = (n: number) => `Keep it under ${n} characters.`;

/** Each field that isn't right, with its message; empty when all is well. */
export function validatePlace(
  f: PlaceForm,
  today = todayLocal(),
): Partial<Record<keyof PlaceForm, string>> {
  const e: Partial<Record<keyof PlaceForm, string>> = {};
  if (!f.hospital) e.hospital = "Choose a hospital.";
  if (f.scope === "dates") {
    if (!f.from) e.from = "Choose the start date.";
    else if (f.to && f.to < f.from)
      e.to = "The end date must be on or after the start date.";
  }
  if (!f.reason) e.reason = "Choose a reason.";
  const ref = f.reference.trim();
  if (!ref) e.reference = "Enter the reference.";
  else if (ref.length > REFERENCE_MAX) e.reference = over(REFERENCE_MAX);
  const by = f.asked_by.trim();
  if (!by) e.asked_by = "Enter who asked for it.";
  else if (by.length > ASKED_BY_MAX) e.asked_by = over(ASKED_BY_MAX);
  const note = f.note.trim();
  if (f.reason === "other" && !note) e.note = "Add a note.";
  else if (note.length > NOTE_MAX) e.note = over(NOTE_MAX);
  if (!f.review_on || f.review_on <= today)
    e.review_on = "Choose a review date after today.";
  return e;
}
