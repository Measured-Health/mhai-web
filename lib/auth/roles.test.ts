import { describe, expect, it } from "vitest";
import { TEST_USER } from "@/tests/auth-wrapper";
import {
  ADMIN_HOME,
  canUse,
  isAdminOnly,
  isClinical,
  isHospitalAdmin,
  isPlatformAccount,
  type Role,
} from "./types";

const as = (...roles: Role[]) => ({ ...TEST_USER, roles });

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
