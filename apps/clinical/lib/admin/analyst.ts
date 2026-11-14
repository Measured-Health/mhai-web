import type { StaffOut } from "../api/admin-contract";
import { ApiError } from "../api/errors";
import { adminError, type AdminError } from "./errors";

// The Analyst role, granted and removed by a hospital admin from Staff
// (core 1.24.0: `PATCH /hospital/staff/{id}` with step-up, through
// migration 00030's rules). Plain words for what it gives, who can have it
// and each of core's refusals.

/** What the role gives, said beside the box. */
export const ANALYST_GIVES =
  "Sees Analysis for this hospital: counts and de-identified patients. Needs the Clinician role, an active account and two-step verification.";

export const ANALYSIS_OFF =
  "Analysis isn't switched on for your hospital. Measured Health switches it on.";

/**
 * Why this person can't be given Analyst right now, from what the screen
 * knows; null when nothing stops it (core checks again). The Clinician rule
 * is the draft's, said by the box itself.
 */
export function analystBlocked(
  row: StaffOut,
  analysisOn: boolean,
): string | null {
  if (row.roles.includes("analyst")) return null;
  if (!analysisOn) return ANALYSIS_OFF;
  if (row.is_you)
    return "You can't give yourself the Analyst role. Ask another hospital admin.";
  if (row.status !== "active")
    return "Deactivated accounts can't be analysts. Reactivate them first.";
  if (row.issues.includes("mfa_not_set_up"))
    return "They need two-step verification turned on before they can be an analyst.";
  return null;
}

/** What the confirmation says when a save gives or removes Analyst. */
export function analystChangeNote(
  row: StaffOut,
  next: readonly string[],
): string | null {
  const had = row.roles.includes("analyst");
  const has = next.includes("analyst");
  if (had === has) return null;
  return has
    ? `${row.display_name} will see Analysis for this hospital: counts and de-identified patients. The change is recorded in the activity log.`
    : `${row.display_name}'s Analysis access ends at once, including any patient list they have open.`;
}

/**
 * Core's refusals of an Analyst change in plain words, for this person.
 * Everything else reads as any staff refusal.
 */
export function analystError(e: unknown, row: StaffOut): AdminError {
  const base = adminError(e);
  if (!(e instanceof ApiError)) return base;
  switch (e.code) {
    case "analysis_off":
      return {
        ...base,
        title: "Analysis isn't switched on for your hospital",
        body: "Nobody can be given the Analyst role until Measured Health switches Analysis on. Nothing was changed.",
      };
    case "analyst_cap":
      return {
        ...base,
        title: "Your hospital has all the analysts it can have",
        body: "Remove the Analyst role from someone else first, or ask Measured Health about the limit. Nothing was changed.",
      };
    case "not_eligible": {
      const why = [
        !row.roles.includes("clinician") && "the Clinician role",
        row.status !== "active" && "an active account",
        row.issues.includes("mfa_not_set_up") && "two-step verification",
      ].filter(Boolean);
      return {
        ...base,
        title: `${row.display_name} can't be an analyst yet`,
        body: why.length
          ? `They need ${why.join(" and ")}. Nothing was changed.`
          : "An analyst needs the Clinician role, an active account and two-step verification turned on. Nothing was changed.",
      };
    }
    case "self_change":
      return {
        ...base,
        title: "You can't give yourself a role",
        body: "Ask another hospital admin to give you the Analyst role. You can remove it from yourself.",
      };
    case "forbidden":
      return {
        ...base,
        title: "You can't change the Analyst role",
        body: "Only a hospital admin of this hospital, signed in with two-step verification, can. Sign out and in again if this keeps happening.",
      };
  }
  return base;
}
