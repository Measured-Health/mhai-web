import type { ActivityEventOut, ActivityType } from "../api/admin-contract";
import { RESULT_LABEL } from "../labels";
import { ROLE_LABEL } from "./staff";

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  sign_in: "Sign-in",
  consultation: "Consultation",
  feedback: "Feedback",
  review: "Review",
  account: "Account",
  admin: "Admin",
  security: "Security",
};
export const ACTIVITY_TYPES = Object.keys(
  ACTIVITY_TYPE_LABEL,
) as ActivityType[];
export const FLAG_LABEL = { policy: "Policy", alert: "Alert" } as const;
/** How long the hospital's log is kept (spec §5.6). */
export const ACTIVITY_KEEP_MONTHS = 12;

const join = (...xs: (string | null | undefined)[]) =>
  xs.filter(Boolean).join(" · ");

export const typeLabel = (e: Pick<ActivityEventOut, "type">) =>
  ACTIVITY_TYPE_LABEL[e.type] ?? "Other";

export const actorName = (e: Pick<ActivityEventOut, "actor">) =>
  e.actor?.display_name || "System";

/**
 * One line per event, built only from the contract's structured fields
 * (R9). Free text from the API is never shown, so nothing clinical can
 * reach the admin side through the log.
 */
export function describeEvent(e: ActivityEventOut): string {
  const t = e.target?.display_name || "someone";
  const level = e.confidence ? RESULT_LABEL[e.confidence] : null;
  switch (e.kind) {
    case "signed_in":
      return join("Signed in", e.device);
    case "signed_in_without_mfa":
      return join("Signed in without two-step (setup pending)", e.device);
    case "sign_in_locked":
      return `${e.count ?? "Several"} failed sign-ins for ${t} · account locked`;
    case "consultation_run":
      return join("Ran a consultation", e.specialty, level);
    case "result_agreed":
      return join("Agreed with a result", e.specialty);
    case "correction_suggested":
      return join("Suggested a correction", e.specialty);
    case "correction_approved":
      return join("Approved a correction", e.specialty);
    case "correction_rejected":
      return join("Rejected a correction", e.specialty);
    case "correction_withdrawn":
      return join("Withdrew a correction", e.specialty);
    case "invite_sent":
      return `Invited ${t}`;
    case "invite_cancelled":
      return `Cancelled the invite for ${t}`;
    case "invite_accepted":
      return "Accepted invite and finished first sign-in";
    case "roles_changed":
      return `Changed ${t}'s roles`;
    case "analyst_granted":
      return `${actorName(e)} gave ${t} Analyst access`;
    case "analyst_removed":
      return `${actorName(e)} removed Analyst access from ${t}`;
    case "analysis_patients_viewed":
      return `${actorName(e)} opened ${e.count ?? "several"} de-identified patients in Analysis`;
    case "analysis_named_viewed":
      return `${actorName(e)} viewed ${e.count ?? "several"} patients by name in Analysis`;
    case "clearance_uploaded":
      return `${actorName(e)} uploaded a clearance letter`;
    case "clearance_refused":
      return "A clearance letter's file was refused";
    case "clearance_verified":
      return `${actorName(e)} at Measured Health verified a clearance letter`;
    case "clearance_rejected":
      return `${actorName(e)} at Measured Health rejected a clearance letter`;
    case "clearance_narrowed":
      return `${actorName(e)} removed ${t} from a clearance letter`;
    case "clearance_revoked":
      return `${actorName(e)} revoked a clearance letter`;
    case "clearance_ended":
      return "A clearance letter ended";
    case "clearance_viewed":
      return `${actorName(e)} viewed a clearance letter`;
    case "clearance_reminder_sent":
      return `A reminder was sent to ${t} about a letter ending`;
    case "alert_units_changed":
      return "Changed which units alerts cover";
    case "alert_rules_changed":
      return "Changed what alerts flag";
    case "alert_recipients_changed":
      return "Changed who gets alerts";
    case "specialty_changed":
      return e.specialty
        ? `Changed ${t}'s specialty to ${e.specialty}`
        : `Changed ${t}'s specialty`;
    case "reviewer_changed":
      return `Changed what ${t} can review`;
    case "deactivated":
      return `Deactivated ${t}`;
    case "reactivated":
      return `Reactivated ${t}`;
    case "removed":
      return `Removed ${t}`;
    case "password_reset_sent":
      return `Sent ${t} a password reset`;
    case "mfa_reset":
      return `Reset ${t}'s two-step verification`;
    case "mfa_reminder_sent":
      return `Reminded ${t} to set up two-step`;
    case "settings_changed":
      return "Changed hospital settings";
    case "reviewers_reminded":
      return join("Reminded reviewers about a correction", e.specialty);
    case "reviewer_assigned":
      return join(`Asked ${t} to review a correction`, e.specialty);
    case "policy_breach":
      return "Hospital policy not met";
    case "self_role_change": {
      const added = (e.roles_added ?? [])
        .map((r) => ROLE_LABEL[r])
        .filter(Boolean);
      return added.length
        ? `Gave themselves the ${added.join(" and ")} role${added.length > 1 ? "s" : ""}`
        : "Changed their own roles";
    }
    default:
      return `${typeLabel(e)} activity`;
  }
}

export type ActivityRange = "today" | "7d" | "30d" | "12m";
export const ACTIVITY_RANGES: readonly { id: ActivityRange; label: string }[] =
  [
    { id: "today", label: "Today" },
    { id: "7d", label: "Last 7 days" },
    { id: "30d", label: "Last 30 days" },
    { id: "12m", label: "Last 12 months" },
  ];

const DAY = 86_400_000;

/** ISO start of a range: local midnight for "today". */
export function rangeStart(r: ActivityRange, now: number): string {
  if (r === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = r === "7d" ? 7 : r === "30d" ? 30 : 365;
  return new Date(now - days * DAY).toISOString();
}
