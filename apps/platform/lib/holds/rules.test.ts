import { describe, expect, it } from "vitest";
import type { LegalHold } from "@/lib/api/holds-contract";
import {
  defaultReviewOn,
  isDocumentReference,
  liftedLine,
  placedByLabel,
  scopeLabel,
  statusLine,
  validateEdit,
  validatePlace,
  type PlaceForm,
} from "./rules";

const ADA = { id: "tm_ada", name: "Ada Bakare" };
const CLI = { id: "cli", name: "Provisioning command line" };

describe("scopeLabel", () => {
  it("a hold always keeps every record (core 1.26.0)", () => {
    expect(scopeLabel()).toBe("All records");
  });
});

describe("liftedLine", () => {
  it("says who lifted it and when: a lift lands at once", () => {
    const hold = {
      lift: {
        approved_by: ADA,
        approved_at: "2026-10-19T10:00:00Z",
        released_on: "2026-10-19T10:00:00Z",
      },
    } as LegalHold;
    expect(liftedLine(hold)).toBe("Lifted by Ada Bakare · 19 Oct 2026");
  });
});

describe("defaultReviewOn", () => {
  it("is six months on", () => {
    expect(defaultReviewOn("2026-10-22")).toBe("2027-04-22");
    expect(defaultReviewOn("2026-08-31")).toBe("2027-02-28");
  });
});

describe("isDocumentReference", () => {
  it("takes core's shape only", () => {
    for (const ok of ["LH-2026-0042", "CT-2026-0091", "ABCDEFGH-2026-12345678"])
      expect(isDocumentReference(ok)).toBe(true);
    for (const bad of [
      "HC/2026/0412",
      "lh-2026-0042",
      "LH-26-0042",
      "LH-2026-4",
      "Counsel's letter 14 Oct 2026",
      "A-2026-0042",
    ])
      expect(isDocumentReference(bad)).toBe(false);
  });
});

describe("validatePlace", () => {
  const ok: PlaceForm = {
    hospital: { id: "h_havana", name: "Havana Hospital" },
    reason: "complaint",
    reference: "CMP-2026-0001",
    review_on: "2027-04-22",
  };
  const today = "2026-10-22";
  it("passes a complete form: no dates, no note, no name", () => {
    expect(validatePlace(ok, today)).toEqual({});
  });
  it("words each missing field", () => {
    const e = validatePlace(
      { hospital: null, reason: "", reference: " ", review_on: "" },
      today,
    );
    expect(e).toEqual({
      hospital: "Choose a hospital.",
      reason: "Choose a reason.",
      reference: "Enter the reference.",
      review_on: "Choose a review date after today.",
    });
  });
  it("the reference is a document reference", () => {
    expect(
      validatePlace({ ...ok, reference: "Board request" }, today).reference,
    ).toBe("Use a document reference, like LH-2026-0042.");
  });
  it("the review date is after today and within five years", () => {
    expect(validatePlace({ ...ok, review_on: today }, today).review_on).toBe(
      "Choose a review date after today.",
    );
    expect(
      validatePlace({ ...ok, review_on: "2031-10-23" }, today).review_on,
    ).toBe("Choose a review date within 5 years.");
    expect(validatePlace({ ...ok, review_on: "2031-10-22" }, today)).toEqual(
      {},
    );
  });
});

describe("statusLine and placedByLabel", () => {
  const base = {
    placed_by: ADA,
    placed_at: "2026-10-01T10:00:00Z",
    review_on: "2027-04-01",
    lift: null,
  } as unknown as LegalHold;
  it("says who placed an active hold and when", () => {
    expect(statusLine({ ...base, status: "active" })).toBe(
      "Active · placed by Ada Bakare · 1 Oct 2026",
    );
    expect(placedByLabel(base)).toBe("Placed by Ada Bakare");
  });
  it("a hold the command line placed says Placed by the system", () => {
    const cli = { ...base, placed_by: CLI, status: "active" } as LegalHold;
    expect(statusLine(cli)).toBe("Active · placed by the system · 1 Oct 2026");
    expect(placedByLabel(cli)).toBe("Placed by the system");
  });
  it("says Review due with the date, and that a lift request is still active", () => {
    expect(statusLine({ ...base, status: "review_due" })).toBe(
      "Review due · 1 Apr 2027",
    );
    expect(statusLine({ ...base, status: "lift_requested" })).toBe(
      "Lift requested · still active",
    );
  });
  it("a lifted hold says who lifted it", () => {
    const lifted = {
      ...base,
      status: "lifted",
      lift: {
        approved_by: ADA,
        approved_at: "2026-10-19T10:00:00Z",
        released_on: "2026-10-19T10:00:00Z",
      },
    } as LegalHold;
    expect(statusLine(lifted)).toBe("Lifted by Ada Bakare · 19 Oct 2026");
  });
});

describe("validateEdit", () => {
  const today = "2026-10-22";
  it("a changed review date must be after today; an unchanged past one is fine", () => {
    const h = { review_on: "2026-10-01" };
    expect(validateEdit({ review_on: "2026-10-22" }, h, today)).toEqual({
      review_on: "Choose a review date after today.",
    });
    expect(validateEdit({ review_on: "2026-10-01" }, h, today)).toEqual({});
    expect(validateEdit({ review_on: "" }, h, today)).toEqual({
      review_on: "Choose a review date.",
    });
  });
});
