// Named access in Analysis (Plan 11c): the words, and how a named view ends.
// Names show only while the server says so; anything else ends them, and the
// page falls back to the de-identified list with "Named access has ended"
// and one of these reasons.
import type { ClearanceMeOut, NamedPurpose } from "../api/analysis-contract";
import { ApiError } from "../api/errors";

export const PURPOSE_LABEL: Record<NamedPurpose, string> = {
  clinical_follow_up: "Clinical follow-up",
  quality_improvement: "Quality improvement",
  audit: "Audit",
  other: "Other",
};

/** The most characters the purpose note may have. */
export const PURPOSE_NOTE_MAX = 200;

/** Why names were taken away. */
export type EndReason =
  | "until"
  | "changed"
  | "ended"
  | "revoked"
  | "removed_from_letter"
  | "role_or_account"
  | "switched_off"
  | "filters";

/** Each shown after "Named access has ended". */
export const END_TEXT: Record<EndReason, string> = {
  until: "This named view has ended. Show names again to continue.",
  changed: "Your clearance changed.",
  ended: "The clearance letter has ended.",
  revoked: "The clearance letter was revoked.",
  removed_from_letter: "You were removed from the clearance letter.",
  role_or_account: "Your role or account changed.",
  switched_off: "Named access was switched off.",
  filters: "Showing names again starts a new recorded view.",
};

/** The 403 codes that end a named view. */
const ENDING_CODES: Record<string, EndReason> = {
  clearance_ended: "ended",
  not_cleared: "changed",
  named_access_off: "switched_off",
};

const isMe = (v: unknown): v is ClearanceMeOut =>
  typeof v === "object" &&
  v !== null &&
  !(v instanceof Error) &&
  typeof (v as { named?: unknown }).named === "boolean";

/**
 * Why names end, from a refusal or a `clearance/me` reply; null when this
 * doesn't end them (another error, or still named).
 */
export function endReasonFrom(e: unknown | ClearanceMeOut): EndReason | null {
  if (e instanceof ApiError)
    return e.status === 403 && Object.hasOwn(ENDING_CODES, e.code)
      ? ENDING_CODES[e.code]
      : null;
  if (!isMe(e) || e.named) return null;
  // Not named any more, with no reason given: still a change.
  return e.reason === null || e.reason === "none" ? "changed" : e.reason;
}

/** True when names must end: `named`, the letter or its version changed, or `b` couldn't be read. */
export function meChanged(
  a: ClearanceMeOut,
  b: ClearanceMeOut | null,
): boolean {
  return (
    b === null ||
    a.named !== b.named ||
    a.clearance_id !== b.clearance_id ||
    a.version !== b.version
  );
}

/** Milliseconds until names must go; 0 when already past or unreadable. */
export function msUntil(namedUntil: string, now: number): number {
  const t = Date.parse(namedUntil);
  return Number.isNaN(t) ? 0 : Math.max(0, t - now);
}

/**
 * True when a `clearance/me` reply says names may show now: named, with an
 * `until` still ahead. A named reply whose `until` has passed ends names.
 */
export function namedNow(
  me: ClearanceMeOut | null | undefined,
  now: number,
): boolean {
  return !!me?.named && me.until !== null && msUntil(me.until, now) > 0;
}
