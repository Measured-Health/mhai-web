import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { endSessionRequests } from "@/lib/queries/session-end";
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

  it("a hand-off is forgotten at sign-out", () => {
    openAuditAt("integrity");
    endSessionRequests(new QueryClient());
    expect(takeAuditTab()).toBeNull();
  });
});
