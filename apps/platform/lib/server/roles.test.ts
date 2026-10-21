// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toPlatformRoles } from "./roles";

describe("toPlatformRoles", () => {
  it("admin and platform_admin both map to platform_admin", () => {
    expect(toPlatformRoles(["admin"])).toEqual(["platform_admin"]);
    expect(toPlatformRoles(["platform_admin"])).toEqual(["platform_admin"]);
    expect(toPlatformRoles(["admin", "platform_admin"])).toEqual([
      "platform_admin",
    ]);
  });
  it("auditor maps to auditor", () => {
    expect(toPlatformRoles(["auditor"])).toEqual(["auditor"]);
    expect(toPlatformRoles(["auditor", "admin"])).toEqual([
      "platform_admin",
      "auditor",
    ]);
  });
  it("clinician and hospital_admin are dropped", () => {
    expect(toPlatformRoles(["clinician", "hospital_admin"])).toEqual([]);
    expect(toPlatformRoles(["clinician", "auditor"])).toEqual(["auditor"]);
    expect(toPlatformRoles([])).toEqual([]);
  });
});
