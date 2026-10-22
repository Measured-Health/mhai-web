import { describe, expect, it } from "vitest";
import type { HoldEvent, HoldReason } from "@/lib/api/holds-contract";
import {
  HOLD_HINT,
  holdEventLabel,
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

  it("words every history event", () => {
    expect(
      (
        [
          "placed",
          "edited",
          "lift_requested",
          "lift_cancelled",
          "lift_lapsed",
          "lifted",
          "lift_undone",
          "released",
        ] as const
      ).map(holdEventLabel),
    ).toEqual([
      "Placed the hold",
      "Changed the review date or note",
      "Asked to lift the hold",
      "Cancelled the lift request",
      "The lift request lapsed",
      "Approved the lift",
      "Undid the lift",
      "Records released",
    ]);
  });

  it("never prints a code it doesn't know", () => {
    expect(() => holdReasonLabel("nope" as HoldReason)).toThrow();
    expect(() => holdEventLabel("nope" as HoldEvent["action"])).toThrow();
  });

  it("has the privacy hint", () => {
    expect(HOLD_HINT).toBe(
      "Don't include patient names, hospital numbers or dates of birth.",
    );
  });
});
