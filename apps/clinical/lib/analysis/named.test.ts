import { describe, expect, it } from "vitest";
import type { ClearanceMeOut } from "../api/analysis-contract";
import { ApiError } from "../api/errors";
import {
  END_TEXT,
  PURPOSE_LABEL,
  PURPOSE_NOTE_MAX,
  endReasonFrom,
  meChanged,
  msUntil,
} from "./named";

const ME: ClearanceMeOut = {
  named: true,
  until: "2027-03-12T22:59:59.999Z",
  clearance_id: "cl_act",
  version: 3,
  reason: null,
};

describe("named access words", () => {
  it("PURPOSE_LABEL and the note limit", () => {
    expect(PURPOSE_LABEL).toEqual({
      clinical_follow_up: "Clinical follow-up",
      quality_improvement: "Quality improvement",
      audit: "Audit",
      other: "Other",
    });
    expect(PURPOSE_NOTE_MAX).toBe(200);
  });

  it("END_TEXT exact", () => {
    expect(END_TEXT).toEqual({
      until: "This named view has ended. Show names again to continue.",
      changed: "Your clearance changed.",
      ended: "The clearance letter has ended.",
      revoked: "The clearance letter was revoked.",
      removed_from_letter: "You were removed from the clearance letter.",
      role_or_account: "Your role or account changed.",
      switched_off: "Named access was switched off.",
      filters: "Showing names again starts a new recorded view.",
    });
  });
});

describe("endReasonFrom", () => {
  it("endReasonFrom for each 403 code and each me reason", () => {
    expect(endReasonFrom(new ApiError(403, "clearance_ended"))).toBe("ended");
    expect(endReasonFrom(new ApiError(403, "not_cleared"))).toBe("changed");
    expect(endReasonFrom(new ApiError(403, "named_access_off"))).toBe(
      "switched_off",
    );
    // Not an ending: another status, another code, or not an error at all.
    expect(endReasonFrom(new ApiError(422, "not_cleared"))).toBeNull();
    expect(endReasonFrom(new ApiError(403, "forbidden"))).toBeNull();
    expect(endReasonFrom(new ApiError(503, "unavailable"))).toBeNull();
    expect(endReasonFrom(new Error("x"))).toBeNull();
    expect(endReasonFrom(null)).toBeNull();
    expect(endReasonFrom(undefined)).toBeNull();

    const off = { ...ME, named: false, until: null, clearance_id: null };
    for (const reason of [
      "ended",
      "revoked",
      "removed_from_letter",
      "role_or_account",
      "switched_off",
    ] as const)
      expect(endReasonFrom({ ...off, reason }), reason).toBe(reason);
    // Not named for no stated reason is still a change.
    expect(endReasonFrom({ ...off, reason: "none" })).toBe("changed");
    expect(endReasonFrom({ ...off, reason: null })).toBe("changed");
    // Still named: nothing has ended.
    expect(endReasonFrom(ME)).toBeNull();
  });
});

describe("meChanged", () => {
  it("meChanged on version, clearance and named", () => {
    expect(meChanged(ME, { ...ME })).toBe(false);
    // `until` and `reason` alone are not a change.
    expect(meChanged(ME, { ...ME, until: "2027-03-13T22:59:59.999Z" })).toBe(
      false,
    );
    expect(meChanged(ME, { ...ME, version: 4 })).toBe(true);
    expect(meChanged(ME, { ...ME, clearance_id: "cl_soon" })).toBe(true);
    expect(meChanged(ME, { ...ME, named: false })).toBe(true);
    // A reply that can't be read counts as a change.
    expect(meChanged(ME, null)).toBe(true);
  });
});

describe("msUntil", () => {
  it("counts down to named_until, never below 0", () => {
    const now = Date.parse("2027-03-12T21:59:59.999Z");
    expect(msUntil("2027-03-12T22:59:59.999Z", now)).toBe(3_600_000);
    expect(msUntil("2027-03-12T20:00:00.000Z", now)).toBe(0);
    expect(msUntil("not a time", now)).toBe(0);
  });
});
