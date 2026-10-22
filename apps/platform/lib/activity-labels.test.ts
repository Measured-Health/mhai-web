import { describe, expect, it } from "vitest";
import type { ActivityAction } from "@/lib/api/contract";
import { actionLabel, formatWhen } from "./activity-labels";

const WITH: Record<ActivityAction, string> = {
  hospital_added: "added the hospital",
  hospital_updated: "updated the hospital details",
  hospital_deactivated: "deactivated the hospital",
  hospital_reactivated: "reactivated the hospital",
  removal_requested: "requested removal",
  removal_blocked: "tried to approve removal, but a check blocked it",
  removal_approved: "approved removal",
  removal_cancelled: "cancelled the removal request",
  hospital_removed: "removed the hospital",
  sso_updated: "updated single sign-on",
  sso_tested: "tested single sign-on",
  admin_invited: "invited Kemi as first hospital admin",
  admin_invite_resent: "resent the invite to Kemi",
  team_invited: "invited Kemi to the team",
  team_role_changed: "changed Kemi's role",
  team_removed: "removed Kemi from the team",
  change_followed_up: "marked “Kemi” followed up",
  change_note_edited: "edited the follow-up note on “Kemi”",
  change_follow_up_undone: "undid the follow-up on “Kemi”",
};
const WITHOUT: Partial<Record<ActivityAction, string>> = {
  admin_invited: "invited the first hospital admin",
  admin_invite_resent: "resent the invite",
  team_invited: "invited someone to the team",
  team_role_changed: "changed a team member's role",
  team_removed: "removed a team member",
  change_followed_up: "marked a change followed up",
  change_note_edited: "edited a follow-up note",
  change_follow_up_undone: "undid a follow-up",
};

describe("actionLabel", () => {
  it.each(Object.entries(WITH))("%s reads as a sentence", (a, text) => {
    expect(actionLabel(a as ActivityAction, "Kemi")).toBe(text);
  });
  it.each(Object.entries(WITHOUT))("%s without a target", (a, text) => {
    expect(actionLabel(a as ActivityAction, null)).toBe(text);
  });
  it("formats a time plainly", () => {
    expect(formatWhen("2026-10-21T10:42:00")).toBe("21 Oct 2026, 10:42");
  });
});
