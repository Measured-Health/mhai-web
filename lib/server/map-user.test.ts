import { describe, expect, it } from "vitest";
import { stepsFor, toDevice, toUser } from "./map-user";

describe("toUser", () => {
  it("maps what the API sends and nulls what it doesn't", () => {
    expect(toUser({ username: "a.reyes", role: "clinician" })).toEqual({
      username: "a.reyes",
      email: null,
      displayName: "a.reyes",
      fullName: null,
      role: "clinician",
      roleTitle: null,
      specialty: null,
      hospital: null,
      mfaEnabled: false,
      backupCodesLeft: null,
    });
    expect(
      toUser({ username: "u", role: "clinician", full_name: "Dr. Ana Reyes" })
        .displayName,
    ).toBe("Dr. Ana Reyes");
  });
  it("treats an unknown role as non-clinical", () => {
    expect(toUser({ username: "u", role: "system" }).role).toBe("researcher");
  });
});

describe("stepsFor", () => {
  it("derives first sign-in steps without guessing", () => {
    expect(stepsFor({ username: "u", role: "clinician" })).toEqual([]);
    expect(
      stepsFor({
        username: "u",
        role: "clinician",
        must_change_password: true,
        mfa_enabled: false,
      }),
    ).toEqual(["terms", "password", "mfa"]);
    expect(
      stepsFor({ username: "u", role: "clinician", mfa_enabled: true }),
    ).toEqual([]);
  });
  it("asks for terms only when the API says they were never accepted", () => {
    expect(
      stepsFor({ username: "u", role: "clinician", terms_accepted_at: null }),
    ).toEqual(["terms"]);
    expect(
      stepsFor({
        username: "u",
        role: "clinician",
        terms_accepted_at: "2026-10-01T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      stepsFor({
        username: "u",
        role: "clinician",
        must_change_password: true,
        terms_accepted_at: null,
      }),
    ).toEqual(["terms", "password"]);
  });
});

describe("toDevice", () => {
  it("maps a device", () => {
    expect(
      toDevice({
        id: "s1",
        device: "Chrome on Windows",
        location: null,
        last_seen_at: "2026-10-15T08:00:00Z",
        current: true,
      }),
    ).toEqual({
      id: "s1",
      label: "Chrome on Windows",
      place: null,
      lastActiveAt: Date.parse("2026-10-15T08:00:00Z"),
      current: true,
    });
  });
});
