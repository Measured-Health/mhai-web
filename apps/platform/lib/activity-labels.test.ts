import { describe, expect, it } from "vitest";
import type { ActivityAction } from "@/lib/api/contract";
import { actionLabel, formatWhen } from "./activity-labels";

describe("actionLabel", () => {
  it("has a plain sentence for every action", () => {
    const all: ActivityAction[] = [
      "hospital_added",
      "hospital_updated",
      "hospital_deactivated",
      "hospital_reactivated",
      "removal_requested",
      "removal_blocked",
      "removal_approved",
      "removal_cancelled",
      "hospital_removed",
      "sso_updated",
      "sso_tested",
      "admin_invited",
      "admin_invite_resent",
      "team_invited",
      "team_role_changed",
      "team_removed",
    ];
    for (const a of all) {
      const s = actionLabel(a, "Kemi");
      expect(s).toMatch(/^[a-z]/);
      expect(s).not.toContain("_");
    }
    expect(actionLabel("team_role_changed", "Amara Eze")).toBe(
      "changed Amara Eze's role",
    );
    expect(actionLabel("team_removed", "Amara Eze")).toBe(
      "removed Amara Eze from the team",
    );
    expect(actionLabel("team_removed", null)).toBe("removed a team member");
  });
  it("formats a time plainly", () => {
    expect(formatWhen("2026-10-21T10:42:00")).toBe("21 Oct 2026, 10:42");
  });
});
