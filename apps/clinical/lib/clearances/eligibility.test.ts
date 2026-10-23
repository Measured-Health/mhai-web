import { describe, expect, it } from "vitest";
import type { StaffOut } from "../api/admin-contract";
import { eligibility } from "./eligibility";

const staff = (over: Partial<StaffOut>): StaffOut => ({
  id: "s1",
  full_name: "A B",
  display_name: "A B",
  email: "a@h.example",
  roles: ["analyst"],
  specialty: null,
  can_review: false,
  review_specialties: [],
  status: "active",
  issues: [],
  sign_in: "password_mfa",
  last_active_at: null,
  joined_at: null,
  invited_at: null,
  invite_expires_at: null,
  is_you: false,
  version: 1,
  ...over,
});

describe("eligibility", () => {
  it("accepts an active analyst or hospital admin with two-step on", () => {
    expect(eligibility(staff({}))).toEqual({ ok: true });
    expect(eligibility(staff({ roles: ["hospital_admin"] }))).toEqual({
      ok: true,
    });
  });
  it("gives each reason", () => {
    expect(eligibility(staff({ roles: ["clinician"] }))).toEqual({
      ok: false,
      reason: "Not an analyst or hospital admin",
    });
    expect(eligibility(staff({ issues: ["mfa_not_set_up"] }))).toEqual({
      ok: false,
      reason: "Two-step isn't on",
    });
    expect(eligibility(staff({ status: "deactivated" }))).toEqual({
      ok: false,
      reason: "Not active",
    });
  });
  it("reports not active before the other reasons", () => {
    expect(
      eligibility(
        staff({
          status: "invited",
          roles: ["clinician"],
          issues: ["mfa_not_set_up"],
        }),
      ),
    ).toEqual({ ok: false, reason: "Not active" });
  });
});
