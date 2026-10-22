import { describe, expect, it } from "vitest";
import type { HoldReason } from "@/lib/api/holds-contract";
import {
  HOLD_HINT,
  holdFilterLabel,
  holdReasonLabel,
  holdStatusLabel,
  liftReasonLabel,
} from "./labels";

describe("hold labels", () => {
  it("words every reason, lift reason and status", () => {
    expect(
      (
        [
          "court_case",
          "regulator",
          "complaint",
          "investigation",
          "other",
        ] as const
      ).map(holdReasonLabel),
    ).toEqual([
      "Court case or claim",
      "Regulator or inspector request",
      "Complaint",
      "Internal investigation",
      "Other",
    ]);
    expect(
      (["case_closed", "withdrawn", "mistake", "other"] as const).map(
        liftReasonLabel,
      ),
    ).toEqual([
      "The case is closed",
      "The request was withdrawn",
      "Placed by mistake",
      "Other",
    ]);
    expect(
      (["active", "review_due", "lift_requested", "lifted"] as const).map(
        holdStatusLabel,
      ),
    ).toEqual(["Active", "Review due", "Lift requested", "Lifted"]);
    expect(holdFilterLabel("open")).toBe("Open");
    expect(holdFilterLabel("all")).toBe("All");
  });

  it("never prints a code it doesn't know", () => {
    expect(() => holdReasonLabel("nope" as HoldReason)).toThrow();
  });

  it("has the privacy hint", () => {
    expect(HOLD_HINT).toBe(
      "Don't include patient names, hospital numbers or dates of birth.",
    );
  });
});
