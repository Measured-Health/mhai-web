import type { ActivityAction } from "@/lib/api/contract";

/** What was done, as the end of a sentence after the person's name. */
export function actionLabel(a: ActivityAction, target?: string | null): string {
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
