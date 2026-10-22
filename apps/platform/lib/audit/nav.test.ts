import { describe, expect, it } from "vitest";
import { openAuditAt, takeAuditTab } from "./nav";

describe("the audit tab hand-off", () => {
  it("a tab handed off is taken once", () => {
    expect(takeAuditTab()).toBeNull();
    openAuditAt("integrity");
    expect(takeAuditTab()).toEqual({ tab: "integrity" });
    expect(takeAuditTab()).toBeNull();
    openAuditAt("named", { hospital: "h_ng", clearance: "cl_1" });
    openAuditAt("exports");
    expect(takeAuditTab()).toEqual({ tab: "exports" });
    expect(takeAuditTab()).toBeNull();
    openAuditAt("named", { hospital: "h_ng", clearance: "cl_1" });
    expect(takeAuditTab()).toEqual({
      tab: "named",
      named: { hospital: "h_ng", clearance: "cl_1" },
    });
  });
});
