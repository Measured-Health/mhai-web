import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { FORBIDDEN_TERMS } from "../labels";
import { makeStaff } from "@/tests/admin";
import {
  ANALYSIS_OFF,
  ANALYST_GIVES,
  analystBlocked,
  analystChangeNote,
  analystError,
} from "./analyst";

const okafor = makeStaff({ display_name: "Dr. Okafor" });

describe("the Analyst role", () => {
  it("says what it gives and what it needs", () => {
    expect(ANALYST_GIVES).toMatch(/counts and de-identified patients/);
    expect(ANALYST_GIVES).toMatch(
      /Clinician role, an active account and two-step verification/,
    );
  });

  it("says why someone can't be given it, before anything is sent", () => {
    expect(analystBlocked(okafor, true)).toBeNull();
    expect(analystBlocked(okafor, false)).toBe(ANALYSIS_OFF);
    expect(analystBlocked({ ...okafor, is_you: true }, true)).toMatch(
      /can't give yourself the Analyst role/,
    );
    expect(analystBlocked({ ...okafor, status: "deactivated" }, true)).toMatch(
      /Reactivate them first/,
    );
    expect(
      analystBlocked({ ...okafor, issues: ["mfa_not_set_up"] }, true),
    ).toMatch(/two-step verification turned on/);
    // Someone who has it can always lose it, even with Analysis off.
    expect(
      analystBlocked({ ...okafor, roles: ["clinician", "analyst"] }, false),
    ).toBeNull();
  });

  it("says what a grant or a removal does, in the confirmation", () => {
    expect(analystChangeNote(okafor, ["clinician", "analyst"])).toMatch(
      /Dr. Okafor will see Analysis/,
    );
    expect(
      analystChangeNote({ ...okafor, roles: ["clinician", "analyst"] }, [
        "clinician",
      ]),
    ).toMatch(/Analysis access ends at once/);
    expect(analystChangeNote(okafor, ["clinician"])).toBeNull();
  });

  it("explains each of core's refusals for this person", () => {
    const of = (status: number, code: string, row = okafor) =>
      analystError(new ApiError(status, code), row);
    expect(of(409, "analysis_off").title).toBe(
      "Analysis isn't switched on for your hospital",
    );
    expect(of(409, "analyst_cap").body).toMatch(
      /Remove the Analyst role from someone else first/,
    );
    expect(
      of(422, "not_eligible", { ...okafor, issues: ["mfa_not_set_up"] }),
    ).toMatchObject({
      title: "Dr. Okafor can't be an analyst yet",
      body: "They need two-step verification. Nothing was changed.",
    });
    expect(
      of(422, "not_eligible", {
        ...okafor,
        roles: [],
        status: "deactivated",
      }).body,
    ).toBe(
      "They need the Clinician role and an active account. Nothing was changed.",
    );
    expect(of(403, "self_change").title).toBe("You can't give yourself a role");
    expect(of(403, "forbidden").body).toMatch(/signed in with two-step/);
    // Everything else reads as any staff refusal.
    expect(of(409, "conflict")).toMatchObject({ stale: true });
    expect(of(403, "mfa_invalid").title).toBe(
      "That code didn't work. Try again.",
    );
    for (const c of [
      "analysis_off",
      "analyst_cap",
      "not_eligible",
      "self_change",
      "forbidden",
    ]) {
      const { title, body } = of(409, c);
      expect(`${title} ${body}`).not.toContain("_");
      for (const t of FORBIDDEN_TERMS)
        expect(`${title} ${body}`).not.toContain(t);
    }
  });
});
