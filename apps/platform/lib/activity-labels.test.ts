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
  hold_placed: "placed legal hold Kemi",
  hold_edited: "changed the review date or note on legal hold Kemi",
  hold_lift_requested: "asked to lift legal hold Kemi",
  hold_lift_cancelled: "cancelled the request to lift legal hold Kemi",
  hold_lift_lapsed: "asked to lift legal hold Kemi; the request lapsed",
  hold_lifted: "approved lifting legal hold Kemi",
  hold_lift_undone: "undid the lift of legal hold Kemi",
  hold_released: "released the records under legal hold Kemi",
  jobs_retried: "retried Kemi",
  jobs_cancelled: "cancelled Kemi",
  retention_changed: "changed records retention: Kemi",
  setting_change_requested: "asked for a change: Kemi",
  setting_change_approved: "approved a change: Kemi",
  setting_change_cancelled: "cancelled a change request: Kemi",
  setting_change_lapsed: "asked for a change that lapsed: Kemi",
  clean_up_paused: "paused the records clean-up",
  clean_up_resumed: "resumed the records clean-up",
  triage_switched_off: "switched triage off",
  feedback_buffer_cleared: "cleared unapproved learning data: Kemi",
  emr_connection_added: "added the record connection “Kemi”",
  emr_connection_changed: "changed the record connection “Kemi”",
  emr_connection_switched_on: "switched on the record connection “Kemi”",
  emr_connection_switched_off: "switched off the record connection “Kemi”",
  emr_connection_tested: "tested the record connection “Kemi”",
  clearance_viewed: "viewed Kemi",
  clearance_verified: "verified Kemi",
  clearance_rejected: "rejected Kemi",
  clearance_revoked: "revoked Kemi",
  clearance_verify_refused: "couldn't verify Kemi",
  named_access_requested: "asked to turn named access to Kemi",
  named_access_approved: "approved turning named access to Kemi",
  named_access_cancelled: "cancelled turning named access to Kemi",
  named_access_lowered: "turned named access down to Kemi",
  analysis_switched: "turned Analysis on or off",
  patient_views_switched: "turned patient lists in Analysis on or off",
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
  hold_placed: "placed a legal hold",
  hold_edited: "changed the review date or note on a legal hold",
  hold_lift_requested: "asked to lift a legal hold",
  hold_lift_cancelled: "cancelled a request to lift a legal hold",
  hold_lift_lapsed: "asked to lift a legal hold; the request lapsed",
  hold_lifted: "approved lifting a legal hold",
  hold_lift_undone: "undid the lift of a legal hold",
  hold_released: "released the records under a legal hold",
  jobs_retried: "retried failed jobs",
  jobs_cancelled: "cancelled failed jobs",
  retention_changed: "changed records retention",
  setting_change_requested: "asked for a change to a setting",
  setting_change_approved: "approved a change to a setting",
  setting_change_cancelled: "cancelled a change request",
  setting_change_lapsed: "asked for a change that lapsed",
  clean_up_paused: "paused the records clean-up",
  clean_up_resumed: "resumed the records clean-up",
  triage_switched_off: "switched triage off",
  feedback_buffer_cleared: "cleared unapproved learning data",
  emr_connection_added: "added the record connection",
  emr_connection_changed: "changed the record connection",
  emr_connection_switched_on: "switched on the record connection",
  emr_connection_switched_off: "switched off the record connection",
  emr_connection_tested: "tested the record connection",
  clearance_viewed: "viewed a clearance letter",
  clearance_verified: "verified a clearance letter",
  clearance_rejected: "rejected a clearance letter",
  clearance_revoked: "revoked a clearance letter",
  clearance_verify_refused: "couldn't verify a letter",
  named_access_requested: "asked to change named access",
  named_access_approved: "approved a change to named access",
  named_access_cancelled: "cancelled a change to named access",
  named_access_lowered: "turned named access down",
  analysis_switched: "turned Analysis on or off",
  patient_views_switched: "turned patient lists in Analysis on or off",
};

describe("actionLabel", () => {
  it.each(Object.entries(WITH))("%s reads as a sentence", (a, text) => {
    expect(actionLabel(a as ActivityAction, "Kemi")).toBe(text);
  });
  it.each(Object.entries(WITHOUT))("%s without a target", (a, text) => {
    expect(actionLabel(a as ActivityAction, null)).toBe(text);
  });
  it("realistic targets read as the brief words them", () => {
    expect(actionLabel("jobs_retried", "3 failed jobs")).toBe(
      "retried 3 failed jobs",
    );
    expect(actionLabel("retention_changed", "Documents to 7 years")).toBe(
      "changed records retention: Documents to 7 years",
    );
    expect(actionLabel("setting_change_requested", "Triage on")).toBe(
      "asked for a change: Triage on",
    );
    expect(actionLabel("hold_placed", "  ")).toBe("placed a legal hold");
  });
  it("the nine clearance labels read with their real targets", () => {
    const letter = "the clearance letter signed by Dr. Funmi Ade";
    expect(actionLabel("clearance_viewed", letter)).toBe(
      "viewed the clearance letter signed by Dr. Funmi Ade",
    );
    expect(actionLabel("clearance_verified", letter)).toBe(
      "verified the clearance letter signed by Dr. Funmi Ade",
    );
    expect(actionLabel("clearance_rejected", letter)).toBe(
      "rejected the clearance letter signed by Dr. Funmi Ade",
    );
    expect(actionLabel("clearance_revoked", letter)).toBe(
      "revoked the clearance letter signed by Dr. Funmi Ade",
    );
    expect(actionLabel("clearance_verify_refused", letter, "same_side")).toBe(
      "couldn't verify the clearance letter signed by Dr. Funmi Ade: they're linked to the hospital",
    );
    expect(actionLabel("clearance_verify_refused", letter, "same_person")).toBe(
      "couldn't verify the clearance letter signed by Dr. Funmi Ade: the letter names them",
    );
    expect(actionLabel("clearance_verify_refused", null, "same_side")).toBe(
      "couldn't verify a letter: they're linked to the hospital",
    );
    // An unknown or inherited code adds nothing.
    expect(actionLabel("clearance_verify_refused", null, "constructor")).toBe(
      "couldn't verify a letter",
    );
    expect(
      actionLabel("named_access_requested", "On for Havana Hospital"),
    ).toBe("asked to turn named access to On for Havana Hospital");
    expect(
      actionLabel("named_access_approved", "Letters only for every hospital"),
    ).toBe("approved turning named access to Letters only for every hospital");
    expect(
      actionLabel(
        "named_access_cancelled",
        "On for Riverside Children's Hospital",
      ),
    ).toBe(
      "cancelled turning named access to On for Riverside Children's Hospital",
    );
    expect(actionLabel("named_access_lowered", "Off for every hospital")).toBe(
      "turned named access down to Off for every hospital",
    );
  });
  it("the Analysis switches say which way, from the detail", () => {
    expect(actionLabel("analysis_switched", null, null, "on")).toBe(
      "turned Analysis on",
    );
    expect(actionLabel("analysis_switched", null, null, "off")).toBe(
      "turned Analysis off",
    );
    expect(actionLabel("patient_views_switched", null, null, "on")).toBe(
      "turned patient lists in Analysis on",
    );
    expect(actionLabel("patient_views_switched", null, null, "off")).toBe(
      "turned patient lists in Analysis off",
    );
    // Anything else says nothing about the position.
    expect(actionLabel("analysis_switched", null, null, "maybe")).toBe(
      "turned Analysis on or off",
    );
  });
  it("formats a time plainly", () => {
    expect(formatWhen("2026-10-21T10:42:00")).toBe("21 Oct 2026, 10:42");
  });
});
