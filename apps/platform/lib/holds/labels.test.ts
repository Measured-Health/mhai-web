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
      (["placed", "lift_requested", "lift_cancelled", "lifted"] as const).map(
        holdEventLabel,
      ),
    ).toEqual([
      "Placed the hold",
      "Asked to lift the hold",
      "Cancelled the lift request",
      "Approved the lift: the hold was lifted",
    ]);
  });

  it("a hold the command line placed has no reason, and says so", () => {
    expect(holdReasonLabel(null)).toBe("Not given (placed by the system)");
  });

  it("never prints a code it doesn't know", () => {
    expect(() => holdReasonLabel("nope" as HoldReason)).toThrow();
    expect(() => holdEventLabel("nope" as HoldEvent["action"])).toThrow();
  });

  it("says a hold carries no notes and no names", () => {
    expect(HOLD_HINT).toBe(
      "A hold carries no notes and no names: only the reason and a document reference.",
    );
  });
});
