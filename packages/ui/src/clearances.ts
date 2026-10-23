// Clearance letters (Plan 11): the codes, words, limits and day helpers that
// both apps share. The one set of letter status words lives here; the apps
// (and the platform audit log) read it rather than keeping their own.

/** The named-access switch, as the backend reports it. */
export type NamedPosition = "off" | "letters_only" | "on";

export type ClearanceStatus =
  | "checking"
  | "refused"
  | "waiting"
  | "active"
  | "rejected"
  | "ended"
  | "revoked";

export type RefusedReason =
  | "file_type"
  | "file_too_large"
  | "too_many_pages"
  | "password_protected"
  | "unreadable"
  | "failed_safety_check";

export type RejectReason =
  | "wrong_people"
  | "end_date_mismatch"
  | "not_leadership"
  | "unreadable"
  | "other";

export type RevokeReason =
  | "no_longer_needed"
  | "person_left"
  | "uploaded_in_error"
  | "security_concern"
  | "other";

export type NarrowReason =
  "person_left" | "no_longer_needed" | "uploaded_in_error" | "other";

export const POSITION_LABEL: Record<NamedPosition, string> = {
  off: "Off",
  letters_only: "Letters only",
  on: "On",
};

/** Lowest first: a hospital's effective position is the lower of two. */
export const POSITION_ORDER: readonly NamedPosition[] = [
  "off",
  "letters_only",
  "on",
];

export const REFUSED_TEXT: Record<RefusedReason, string> = {
  file_type: "This file type isn't accepted",
  file_too_large: "The file is larger than 10 MB",
  too_many_pages: "The letter has more than 20 pages",
  password_protected: "Password-protected files can't be accepted",
  unreadable: "The file couldn't be read",
  failed_safety_check: "The file didn't pass the safety check",
};

export const REJECT_LABEL: Record<RejectReason, string> = {
  wrong_people: "Doesn't name these people",
  end_date_mismatch: "End date doesn't match",
  not_leadership: "Not signed by leadership",
  unreadable: "Can't read it",
  other: "Other",
};

export const REVOKE_LABEL: Record<RevokeReason, string> = {
  no_longer_needed: "No longer needed",
  person_left: "Person left or changed role",
  uploaded_in_error: "Uploaded in error",
  security_concern: "Security concern",
  other: "Other",
};

export const NARROW_LABEL: Record<NarrowReason, string> = {
  person_left: "Person left or changed role",
  no_longer_needed: "No longer needed",
  uploaded_in_error: "Uploaded in error",
  other: "Other",
};

export const LETTER_MAX_BYTES = 10 * 1024 * 1024;
export const LETTER_MAX_PAGES = 20;
/** People a letter can cover, staff and platform admins together. */
export const COVER_MAX = 20;
export const NOTE_MAX = 500;
export const ENDING_SOON_DAYS = 30;

/**
 * A letter status in a word or two, for lists, filters and the audit log.
 * Where a date matters, use `activeWords`, `endedWords` and `revokedWords`.
 */
export const STATUS_LABEL: Record<ClearanceStatus, string> = {
  checking: "Checking the file",
  refused: "Couldn't accept the file",
  waiting: "Waiting for Measured Health",
  active: "Active",
  rejected: "Rejected",
  ended: "Ended",
  revoked: "Revoked",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Days since the epoch for a `yyyy-mm-dd` day, as a calendar day: no time
 * zone, so no clock change can shift it. Throws on anything else.
 */
function dayNumber(ymd: string): {
  n: number;
  d: number;
  m: number;
  y: number;
} {
  const p = YMD.exec(ymd);
  if (!p) throw new RangeError("Not a yyyy-mm-dd day");
  const [y, m, d] = [Number(p[1]), Number(p[2]), Number(p[3])];
  const ms = Date.UTC(y, m - 1, d);
  const t = new Date(ms);
  if (
    t.getUTCFullYear() !== y ||
    t.getUTCMonth() !== m - 1 ||
    t.getUTCDate() !== d
  )
    throw new RangeError("Not a calendar day");
  return { n: ms / 86_400_000, d, m, y };
}

/** "2027-03-12" → "12 Mar 2027". */
export function dayLabel(ymd: string): string {
  const { d, m, y } = dayNumber(ymd);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Whole days from one day to another; negative when `toYmd` is earlier. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return dayNumber(toYmd).n - dayNumber(fromYmd).n;
}

/**
 * An active letter: "Active until {date}", or, within `ENDING_SOON_DAYS`,
 * "Ends in {n} days", "Ends in 1 day" or "Ends today". `today` is the
 * hospital's day, as the server sends it.
 */
export function activeWords(endYmd: string, todayYmd: string): string {
  const left = daysBetween(todayYmd, endYmd);
  if (left === 0) return "Ends today";
  if (left === 1) return "Ends in 1 day";
  if (left > 1 && left <= ENDING_SOON_DAYS) return `Ends in ${left} days`;
  return `Active until ${dayLabel(endYmd)}`;
}

export const endedWords = (ymd: string) => `Ended ${dayLabel(ymd)}`;
export const revokedWords = (ymd: string) => `Revoked ${dayLabel(ymd)}`;
