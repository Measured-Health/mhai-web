import { describe, expect, it } from "vitest";
import { TEST_USER } from "@/tests/auth-wrapper";
import {
  ADMIN_HOME,
  analysisOn,
  canUse,
  canUseAnalysis,
  canOpenNamedAccess,
  canUseNamedAccess,
  isAdminOnly,
  isClinical,
  isHospitalAdmin,
  isPlatformAccount,
  type Role,
} from "./types";

const as = (...roles: Role[]) => ({ ...TEST_USER, roles });

describe("analysis access", () => {
  const on = (...roles: Role[]) => ({
    ...as(...roles),
    features: { analysis: true },
  });
  it("a clinician with analyst and the feature can use analysis", () => {
    const u = on("clinician", "analyst");
    expect(analysisOn(u)).toBe(true);
    expect(canUseAnalysis(u)).toBe(true);
    expect(canUse(u, "analysis")).toBe(true);
  });
  it("without the feature nobody can", () => {
    for (const u of [
      as("clinician", "analyst"),
      as("hospital_admin"),
      { ...as("hospital_admin"), features: { analysis: false } },
    ]) {
      expect(canUseAnalysis(u)).toBe(false);
      expect(canUse(u, "analysis")).toBe(false);
    }
    expect(analysisOn(null)).toBe(false);
  });
  it("a hospital admin can", () => {
    expect(canUseAnalysis(on("hospital_admin"))).toBe(true);
    expect(canUseAnalysis(on("clinician", "hospital_admin"))).toBe(true);
  });
  it("analyst without clinician can't", () => {
    expect(canUseAnalysis(on("analyst"))).toBe(false);
    expect(canUseAnalysis(on("clinician"))).toBe(false);
  });
  it("a platform account can't", () => {
    expect(canUseAnalysis(on("admin", "hospital_admin"))).toBe(false);
    expect(canUseAnalysis(on("auditor", "clinician", "analyst"))).toBe(false);
  });
});

describe("named access", () => {
  const both = (...roles: Role[]) => ({
    ...as(...roles),
    features: { analysis: true, named: true },
  });
  it("a hospital admin with both features can use named access", () => {
    for (const u of [
      both("hospital_admin"),
      both("clinician", "hospital_admin"),
    ]) {
      expect(canUseNamedAccess(u)).toBe(true);
      expect(canOpenNamedAccess(u)).toBe(true);
    }
    expect(canUseNamedAccess(both("clinician", "analyst"))).toBe(true);
  });
  it("without features.named nobody can", () => {
    for (const roles of [
      ["hospital_admin"],
      ["clinician", "hospital_admin"],
      ["clinician", "analyst"],
    ] as Role[][]) {
      for (const u of [
        { ...as(...roles), features: { analysis: true } },
        { ...as(...roles), features: { analysis: true, named: false } },
        // Named never stands without Analysis.
        { ...as(...roles), features: { analysis: false, named: true } },
        as(...roles),
      ]) {
        expect(canUseNamedAccess(u)).toBe(false);
        expect(canOpenNamedAccess(u)).toBe(false);
      }
    }
    expect(canUseNamedAccess(null)).toBe(false);
    expect(canUseNamedAccess(both("admin", "hospital_admin"))).toBe(false);
    expect(canUseNamedAccess(both("clinician"))).toBe(false);
  });
  it("an analyst who isn't an admin can't open the Named access page", () => {
    const u = both("clinician", "analyst");
    expect(canUseNamedAccess(u)).toBe(true);
    expect(canOpenNamedAccess(u)).toBe(false);
  });
});

describe("roles", () => {
  it("a clinician uses the clinical side only", () => {
    const u = as("clinician");
    expect([isClinical(u), isHospitalAdmin(u), isAdminOnly(u)]).toEqual([
      true,
      false,
      false,
    ]);
    expect(canUse(u, "clinical")).toBe(true);
    expect(canUse(u, "admin")).toBe(false);
  });

  it("a medical director uses both sides", () => {
    const u = as("clinician", "hospital_admin");
    expect(canUse(u, "clinical")).toBe(true);
    expect(canUse(u, "admin")).toBe(true);
    expect(isAdminOnly(u)).toBe(false);
  });

  it("a hospital admin who isn't a clinician uses the admin side only", () => {
    const u = as("hospital_admin");
    expect(isAdminOnly(u)).toBe(true);
    expect(canUse(u, "clinical")).toBe(false);
    expect(canUse(u, "admin")).toBe(true);
  });

  it("a platform role wins over everything (R1)", () => {
    for (const u of [
      as("admin"),
      as("auditor"),
      as("admin", "clinician"),
      as("auditor", "hospital_admin"),
    ]) {
      expect(isPlatformAccount(u)).toBe(true);
      expect(canUse(u, "clinical")).toBe(false);
      expect(canUse(u, "admin")).toBe(false);
    }
  });

  it("nobody signed in, or no known role, uses neither side", () => {
    expect(canUse(null, "clinical")).toBe(false);
    expect(canUse(as("researcher"), "admin")).toBe(false);
    expect(canUse(as(), "clinical")).toBe(false);
  });

  it("names the admin home", () => {
    expect(ADMIN_HOME).toBe("/admin/staff");
  });
});
