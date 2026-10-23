import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisOn, canUseNamedAccess } from "../auth/types";
import { stepsFor, toDevice, toUser, type ApiUser } from "./map-user";

describe("toUser", () => {
  it("maps what the API sends and nulls what it doesn't", () => {
    expect(toUser({ username: "a.reyes", role: "clinician" })).toEqual({
      username: "a.reyes",
      email: null,
      displayName: "a.reyes",
      fullName: null,
      roles: ["clinician"],
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
    expect(toUser({ username: "u", role: "system" }).roles).toEqual([
      "researcher",
    ]);
  });
  it("reads combined roles and keeps only known ones (R1)", () => {
    expect(
      toUser({
        username: "u",
        role: "clinician",
        roles: ["clinician", "hospital_admin", "root"],
      }).roles,
    ).toEqual(["clinician", "hospital_admin"]);
  });
  it("falls back to the single role when roles is missing", () => {
    expect(toUser({ username: "u", role: "hospital_admin" }).roles).toEqual([
      "hospital_admin",
    ]);
  });
  it("never repeats a role", () => {
    expect(
      toUser({
        username: "u",
        role: "clinician",
        roles: ["clinician", "clinician"],
      }).roles,
    ).toEqual(["clinician"]);
  });
});

describe("toUser analysis switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  const base = { username: "u", role: "clinician" };
  it("analysis is on only when the API says so and it is signed off", () => {
    const on = { ...base, features: { analysis: true } };
    expect(toUser(on).features).toBeUndefined();
    vi.stubEnv("ANALYSIS_SIGNED_OFF", "true");
    expect(toUser(on).features).toEqual({ analysis: true });
    expect(toUser(base).features).toBeUndefined();
    expect(
      toUser({ ...base, features: { analysis: false } }).features,
    ).toBeUndefined();
  });
  it("an unknown features value reads off", () => {
    vi.stubEnv("ANALYSIS_SIGNED_OFF", "true");
    for (const features of ["yes", 1, null, [], { analysis: "true" }])
      expect(
        analysisOn(toUser({ ...base, features } as unknown as ApiUser)),
      ).toBe(false);
  });
  it("named is on only with analysis on and the key set", () => {
    const on = { ...base, features: { analysis: true } };
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "true");
    // Analysis not signed off: neither switch.
    expect(toUser(on).features).toBeUndefined();
    vi.stubEnv("ANALYSIS_SIGNED_OFF", "true");
    expect(toUser(on).features).toEqual({ analysis: true, named: true });
    // The API doesn't turn analysis on: named stays off too.
    expect(toUser(base).features).toBeUndefined();
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "TRUE");
    expect(toUser(on).features).toEqual({ analysis: true });
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "");
    expect(toUser(on).features).toEqual({ analysis: true });
  });
  it("the API's named_access alone doesn't turn it on", () => {
    vi.stubEnv("ANALYSIS_SIGNED_OFF", "true");
    const named = {
      ...base,
      roles: ["clinician", "analyst"],
      features: { analysis: true, named_access: true },
    };
    expect(toUser(named).features).toEqual({ analysis: true });
    expect(canUseNamedAccess(toUser(named))).toBe(false);
    vi.stubEnv("NAMED_ACCESS_SIGNED_OFF", "true");
    expect(
      toUser({ ...named, features: { named_access: true } }).features,
    ).toBeUndefined();
    expect(canUseNamedAccess(toUser(named))).toBe(true);
  });
  it("analyst is a known role", () => {
    expect(toUser({ ...base, roles: ["clinician", "analyst"] }).roles).toEqual([
      "clinician",
      "analyst",
    ]);
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
  it("leaves out a last-seen time it can't read", () => {
    expect(
      toDevice({
        id: "s2",
        device: "Firefox on Linux",
        location: null,
        last_seen_at: "not a date",
        current: false,
      }).lastActiveAt,
    ).toBeNull();
  });
});
