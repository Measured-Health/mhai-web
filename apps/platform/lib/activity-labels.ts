import type { ActivityAction } from "@/lib/api/contract";

/** Why a verify was refused, by its code. */
const REFUSED: Record<string, string> = {
  same_side: "they're linked to the hospital",
  same_person: "the letter names them",
};

/**
 * What was done, as the end of a sentence after the person's name. `reason`
 * is a refusal's code, put in words after it.
 */
export function actionLabel(
  a: ActivityAction,
  target?: string | null,
  reason?: string | null,
): string {
  const t = target?.trim() || null;
  switch (a) {
    case "hospital_added":
      return "added the hospital";
    case "hospital_updated":
      return "updated the hospital details";
    case "hospital_deactivated":
      return "deactivated the hospital";
    case "hospital_reactivated":
      return "reactivated the hospital";
    case "removal_requested":
      return "requested removal";
    case "removal_blocked":
      return "tried to approve removal, but a check blocked it";
    case "removal_approved":
      return "approved removal";
    case "removal_cancelled":
      return "cancelled the removal request";
    case "hospital_removed":
      return "removed the hospital";
    case "sso_updated":
      return "updated single sign-on";
    case "sso_tested":
      return "tested single sign-on";
    case "admin_invited":
      return t
        ? `invited ${t} as first hospital admin`
        : "invited the first hospital admin";
    case "admin_invite_resent":
      return t ? `resent the invite to ${t}` : "resent the invite";
    case "team_invited":
      return t ? `invited ${t} to the team` : "invited someone to the team";
    case "team_role_changed":
      return t ? `changed ${t}'s role` : "changed a team member's role";
    case "team_removed":
      return t ? `removed ${t} from the team` : "removed a team member";
    case "change_followed_up":
      return t ? `marked “${t}” followed up` : "marked a change followed up";
    case "change_note_edited":
      return t
        ? `edited the follow-up note on “${t}”`
        : "edited a follow-up note";
    case "change_follow_up_undone":
      return t ? `undid the follow-up on “${t}”` : "undid a follow-up";
    case "hold_placed":
      return t ? `placed legal hold ${t}` : "placed a legal hold";
    case "hold_edited":
      return t
        ? `changed the review date or note on legal hold ${t}`
        : "changed the review date or note on a legal hold";
    case "hold_lift_requested":
      return t ? `asked to lift legal hold ${t}` : "asked to lift a legal hold";
    case "hold_lift_cancelled":
      return t
        ? `cancelled the request to lift legal hold ${t}`
        : "cancelled a request to lift a legal hold";
    case "hold_lift_lapsed":
      return t
        ? `asked to lift legal hold ${t}; the request lapsed`
        : "asked to lift a legal hold; the request lapsed";
    case "hold_lifted":
      return t
        ? `approved lifting legal hold ${t}`
        : "approved lifting a legal hold";
    case "hold_lift_undone":
      return t
        ? `undid the lift of legal hold ${t}`
        : "undid the lift of a legal hold";
    case "hold_released":
      return t
        ? `released the records under legal hold ${t}`
        : "released the records under a legal hold";
    case "jobs_retried":
      return t ? `retried ${t}` : "retried failed jobs";
    case "jobs_cancelled":
      return t ? `cancelled ${t}` : "cancelled failed jobs";
    case "retention_changed":
      return t
        ? `changed records retention: ${t}`
        : "changed records retention";
    case "setting_change_requested":
      return t ? `asked for a change: ${t}` : "asked for a change to a setting";
    case "setting_change_approved":
      return t ? `approved a change: ${t}` : "approved a change to a setting";
    case "setting_change_cancelled":
      return t
        ? `cancelled a change request: ${t}`
        : "cancelled a change request";
    case "setting_change_lapsed":
      return t
        ? `asked for a change that lapsed: ${t}`
        : "asked for a change that lapsed";
    case "clean_up_paused":
      return "paused the records clean-up";
    case "clean_up_resumed":
      return "resumed the records clean-up";
    case "triage_switched_off":
      return "switched triage off";
    case "feedback_buffer_cleared":
      return t
        ? `cleared unapproved learning data: ${t}`
        : "cleared unapproved learning data";
    // Clearance letters: the target is "the clearance letter signed by …".
    case "clearance_viewed":
      return `viewed ${t ?? "a clearance letter"}`;
    case "clearance_verified":
      return `verified ${t ?? "a clearance letter"}`;
    case "clearance_rejected":
      return `rejected ${t ?? "a clearance letter"}`;
    case "clearance_revoked":
      return `revoked ${t ?? "a clearance letter"}`;
    case "clearance_verify_refused": {
      const why =
        reason && Object.hasOwn(REFUSED, reason) ? REFUSED[reason] : null;
      const what = `couldn't verify ${t ?? "a letter"}`;
      return why ? `${what}: ${why}` : what;
    }
    // The switch: the target is "{position} for {hospital}".
    case "named_access_requested":
      return t
        ? `asked to turn named access to ${t}`
        : "asked to change named access";
    case "named_access_approved":
      return t
        ? `approved turning named access to ${t}`
        : "approved a change to named access";
    case "named_access_cancelled":
      return t
        ? `cancelled turning named access to ${t}`
        : "cancelled a change to named access";
    case "named_access_lowered":
      return t
        ? `turned named access down to ${t}`
        : "turned named access down";
  }
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "21 Oct 2026, 10:42" in the viewer's local time. */
export function formatWhen(iso: string): string {
  return WHEN.format(new Date(iso));
}
