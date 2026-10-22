import { describe, expect, it } from "vitest";
import type { LegalHold } from "@/lib/api/holds-contract";
import {
  defaultReviewOn,
  inGrace,
  liftedLine,
  scopeLabel,
  statusLine,
  validateEdit,
  validatePlace,
  type PlaceForm,
} from "./rules";

const ADA = { id: "tm_ada", name: "Ada Bakare" };

describe("scopeLabel", () => {
  it("has three forms", () => {
    expect(scopeLabel({ from: null, to: null })).toBe("All records");
    expect(scopeLabel({ from: "2025-01-01", to: "2025-06-30" })).toBe(
      "Records from 1 Jan 2025 to 30 Jun 2025",
    );
    expect(scopeLabel({ from: "2025-01-01", to: null })).toBe(
      "Records from 1 Jan 2025, until lifted",
    );
  });
});

describe("liftedLine", () => {
  const hold = (released_on: string): LegalHold =>
    ({
      lift: {
        approved_by: ADA,
        approved_at: "2026-10-19T10:00:00Z",
        released_on,
      },
    }) as LegalHold;
  const now = Date.parse("2026-10-22T12:00:00Z");
  it("before released_on, says when the records go", () => {
    expect(liftedLine(hold("2026-10-26T10:00:00Z"), now)).toMatch(
      /^Lifted · records released on 26 Oct 2026$/,
    );
  });
  it("after it, says who lifted and when", () => {
    expect(liftedLine(hold("2026-10-21T10:00:00Z"), now)).toMatch(
      /^Lifted by Ada Bakare · 19 Oct 2026$/,
    );
  });
});

describe("defaultReviewOn", () => {
  it("is six months on", () => {
    expect(defaultReviewOn("2026-10-22")).toBe("2027-04-22");
    expect(defaultReviewOn("2026-08-31")).toBe("2027-02-28");
  });
});

describe("validatePlace", () => {
  const ok: PlaceForm = {
    hospital: { id: "h_havana", name: "Havana Hospital" },
    scope: "all",
    from: "",
    to: "",
    reason: "complaint",
    reference: "CMP-1",
    asked_by: "The complaints office",
    note: "",
    review_on: "2027-04-22",
  };
  const today = "2026-10-22";
  it("passes a complete form", () => {
    expect(validatePlace(ok, today)).toEqual({});
  });
  it("words each missing field", () => {
    const e = validatePlace(
      {
        ...ok,
        hospital: null,
        reason: "",
        reference: " ",
        asked_by: "",
        review_on: "",
      },
      today,
    );
    expect(e).toEqual({
      hospital: "Choose a hospital.",
      reason: "Choose a reason.",
      reference: "Enter the reference.",
      asked_by: "Enter who asked for it.",
      review_on: "Choose a review date after today.",
    });
  });
  it("Other needs a note", () => {
    expect(validatePlace({ ...ok, reason: "other" }, today).note).toBe(
      "Add a note.",
    );
    expect(
      validatePlace({ ...ok, reason: "other", note: "Board request" }, today),
    ).toEqual({});
  });
  it("checks the range", () => {
    const f: PlaceForm = {
      ...ok,
      scope: "dates",
      from: "2025-06-30",
      to: "2025-01-01",
    };
    expect(validatePlace(f, today).to).toBe(
      "The end date must be on or after the start date.",
    );
    expect(validatePlace({ ...f, to: "" }, today)).toEqual({});
    expect(validatePlace({ ...f, to: "2025-06-30" }, today)).toEqual({});
  });
  it("the review date must be after today", () => {
    expect(validatePlace({ ...ok, review_on: today }, today).review_on).toBe(
      "Choose a review date after today.",
    );
  });
  it("limits the lengths", () => {
    const e = validatePlace(
      {
        ...ok,
        reference: "x".repeat(101),
        asked_by: "y".repeat(201),
        note: "z".repeat(501),
      },
      today,
    );
    expect(e.reference).toBe("Keep it under 100 characters.");
    expect(e.asked_by).toBe("Keep it under 200 characters.");
    expect(e.note).toBe("Keep it under 500 characters.");
  });
});

describe("statusLine", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const base = {
    placed_by: ADA,
    placed_at: "2026-10-01T10:00:00Z",
    review_on: "2027-04-01",
    lift: null,
  } as unknown as LegalHold;
  it("says who placed an active hold and when", () => {
    expect(statusLine({ ...base, status: "active" }, now)).toBe(
      "Active · placed by Ada Bakare · 1 Oct 2026",
    );
  });
  it("says Review due with the date, and that a lift request is still active", () => {
    expect(statusLine({ ...base, status: "review_due" }, now)).toBe(
      "Review due · 1 Apr 2027",
    );
    expect(statusLine({ ...base, status: "lift_requested" }, now)).toBe(
      "Lift requested · still active",
    );
  });
  it("a lifted hold uses liftedLine, and is undoable only before released_on", () => {
    const lifted = {
      ...base,
      status: "lifted",
      lift: {
        approved_by: ADA,
        approved_at: "2026-10-19T10:00:00Z",
        released_on: "2026-10-26T10:00:00Z",
      },
    } as LegalHold;
    expect(statusLine(lifted, now)).toBe(
      "Lifted · records released on 26 Oct 2026",
    );
    expect(inGrace(lifted, now)).toBe(true);
    expect(inGrace(lifted, Date.parse("2026-10-26T10:00:00Z"))).toBe(false);
    expect(inGrace({ ...base, status: "active" }, now)).toBe(false);
  });
});

describe("validateEdit", () => {
  const today = "2026-10-22";
  it("a changed review date must be after today; an unchanged past one is fine", () => {
    const h = { review_on: "2026-10-01", reason: "complaint" } as const;
    expect(
      validateEdit({ review_on: "2026-10-22", note: "" }, h, today),
    ).toEqual({ review_on: "Choose a review date after today." });
    expect(
      validateEdit({ review_on: "2026-10-01", note: "" }, h, today),
    ).toEqual({});
    expect(validateEdit({ review_on: "", note: "" }, h, today)).toEqual({
      review_on: "Choose a review date.",
    });
  });
  it("Other keeps a note, and a note is at most 500 characters", () => {
    const h = { review_on: "2027-01-01", reason: "other" } as const;
    expect(
      validateEdit({ review_on: "2027-01-01", note: " " }, h, today),
    ).toEqual({ note: "Add a note." });
    expect(
      validateEdit(
        { review_on: "2027-01-01", note: "x".repeat(501) },
        { ...h, reason: "complaint" },
        today,
      ),
    ).toEqual({ note: "Keep it under 500 characters." });
  });
});
