import { describe, expect, it } from "vitest";
import { reasonLabel, statusLabel } from "./labels";

describe("labels", () => {
  it("names the six statuses", () => {
    expect(
      (
        [
          "active",
          "setup_incomplete",
          "deactivated",
          "removal_pending",
          "removal_scheduled",
          "removed",
        ] as const
      ).map(statusLabel),
    ).toEqual([
      "Active",
      "Set-up incomplete",
      "Deactivated",
      "Removal pending",
      "Removal scheduled",
      "Removed",
    ]);
  });
  it("names the four reasons", () => {
    expect(reasonLabel("hospital_request")).toBe("At the hospital's request");
    expect(reasonLabel("contract_ended")).toBe("Contract ended");
  });
});
