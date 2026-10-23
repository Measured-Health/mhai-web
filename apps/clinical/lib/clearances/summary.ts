import { dayLabel, daysBetween, REFUSED_TEXT } from "@mhai/ui/clearances";
import { ApiError, NotEligibleError } from "@mhai/api-client/errors";
import type { ClearanceOut } from "../api/clearances-contract";
import { adminError } from "../admin/errors";
import { END_DATE_CAP_TEXT } from "./file-check";

/**
 * Each covered person's latest end date over the active letters. `today` is the hospital's day from the server. An "active" letter past its end date counts as ended.
 */
function latestEnds(list: ClearanceOut[], today: string): Map<string, string> {
  const ends = new Map<string, string>();
  for (const c of list) {
    if (c.status !== "active") continue;
    try {
      if (daysBetween(today, c.end_date) < 0) continue;
    } catch {
      continue; // a malformed date fails closed: no access
    }
    for (const p of c.covered) {
      const seen = ends.get(p.id);
      if (seen === undefined || c.end_date > seen) ends.set(p.id, c.end_date);
    }
  }
  return ends;
}

/** The latest end among the active letters covering this person, or null. */
export function namedAccessFor(
  staffId: string,
  list: ClearanceOut[],
  today: string,
): { until: string } | null {
  const until = latestEnds(list, today).get(staffId);
  return until === undefined ? null : { until };
}

/** One line on who has named access now, over the active letters. */
export function accessSummary(list: ClearanceOut[], today: string): string {
  const ends = [...latestEnds(list, today).values()];
  if (ends.length === 0) return "Nobody has named access";
  const earliest = ends.reduce((a, b) => (b < a ? b : a));
  const latest = ends.reduce((a, b) => (b > a ? b : a));
  if (ends.length === 1)
    return `1 person has named access until ${dayLabel(latest)}`;
  if (earliest === latest)
    return `${ends.length} people have named access until ${dayLabel(latest)}`;
  return `${ends.length} people have named access; the earliest ends ${dayLabel(earliest)}`;
}

const join = (names: string[]) =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Plain words for a refused clearance call. `nameOf` turns a refused staff id
 * into a name; without it, or if any id is unknown, the words stay general.
 */
export function errorText(
  e: unknown,
  nameOf?: (id: string) => string | undefined,
): string {
  if (e instanceof NotEligibleError) {
    if (e.code === "not_eligible_platform" && e.emails.length > 0)
      return `These aren't Measured Health platform admins with two-step: ${e.emails.join(", ")}`;
    const names = nameOf ? e.ids.map(nameOf) : [];
    if (nameOf && e.ids.length > 0 && names.every((n): n is string => !!n))
      return `${join(names)} can't be covered. Check the list and try again.`;
    return "Someone you picked can't be covered. Check the list and try again.";
  }
  if (e instanceof ApiError) {
    switch (e.code) {
      case "end_date_too_late":
        return END_DATE_CAP_TEXT;
      case "not_eligible":
      case "not_eligible_platform":
        return "Someone you picked can't be covered. Check the list and try again.";
      case "conflict":
        return "Changed by someone else";
      case "would_empty":
        return "To remove everyone, revoke the letter";
      case "file_too_large":
        return REFUSED_TEXT.file_too_large;
      case "file_type":
        return REFUSED_TEXT.file_type;
      case "named_access_off":
        return "Named access isn't available yet";
      case "invalid":
        return "Check what you entered and try again";
    }
    if (
      e.status === 0 ||
      e.status >= 500 ||
      e.code === "mfa_required" ||
      e.code === "mfa_invalid" ||
      e.code === "mfa_locked" ||
      e.code === "rate_limited"
    )
      return adminError(e).title;
  }
  return "Something went wrong. Try again.";
}
