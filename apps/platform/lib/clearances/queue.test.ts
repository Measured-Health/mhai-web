import { describe, expect, it } from "vitest";
import { letter } from "./fixture";
import { TABS, verifyBlock, waitingText } from "./queue";

const H = 3_600_000;
const READY = "2026-10-20T10:00:00Z";
const t0 = Date.parse(READY);

describe("TABS", () => {
  it("lists the tabs in order, To verify first", () => {
    expect(TABS).toEqual([
      { id: "waiting", label: "To verify" },
      { id: "active", label: "Active" },
      { id: "ending_soon", label: "Ending soon" },
      { id: "all", label: "All" },
    ]);
  });
});

describe("waitingText", () => {
  it("counts hours, then days, from ready_at", () => {
    const c = letter({ ready_at: READY });
    expect(waitingText(c, t0 + 5 * H)).toBe("Waiting 5 hours");
    expect(waitingText(c, t0 + 1 * H)).toBe("Waiting 1 hour");
    expect(waitingText(c, t0 + 30 * 60_000)).toBe("Waiting less than an hour");
    expect(waitingText(c, t0 + 23 * H)).toBe("Waiting 23 hours");
    expect(waitingText(c, t0 + 24 * H)).toBe("Waiting 1 day");
    expect(waitingText(c, t0 + 3 * 24 * H + 5 * H)).toBe("Waiting 3 days");
  });
  it("doesn't count time before ready_at, or without one", () => {
    expect(waitingText(letter({ ready_at: READY }), t0 - H)).toBe(
      "Waiting less than an hour",
    );
    expect(waitingText(letter({ ready_at: null }), t0)).toBe("Waiting");
    expect(waitingText(letter({ ready_at: "soon" }), t0)).toBe("Waiting");
  });
});

describe("verifyBlock", () => {
  it("blocks an auditor, a covered admin, a linked admin, a checking letter and a verified one", () => {
    expect(verifyBlock(letter(), false)).toBe("auditor");
    expect(verifyBlock(letter({ covers_you: true }), true)).toBe("covers_you");
    expect(verifyBlock(letter({ verifiable_by_you: false }), true)).toBe(
      "same_side",
    );
    expect(verifyBlock(letter({ status: "checking" }), true)).toBe("not_ready");
    expect(
      verifyBlock(letter({ status: "active", verified_at: READY }), true),
    ).toBe("done");
    expect(verifyBlock(letter(), true)).toBeNull();
  });
  it("gives a covered admin who is also linked covers_you", () => {
    expect(
      verifyBlock(letter({ covers_you: true, verifiable_by_you: false }), true),
    ).toBe("covers_you");
  });
  it("puts the auditor first, even on a covering letter", () => {
    expect(verifyBlock(letter({ covers_you: true }), false)).toBe("auditor");
  });
});
