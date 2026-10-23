import { describe, expect, it } from "vitest";
import { TEST_USER } from "@/tests/auth-wrapper";
import {
  ADMIN_HOME,
  analysisOn,
  canUse,
  canUseAnalysis,
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
