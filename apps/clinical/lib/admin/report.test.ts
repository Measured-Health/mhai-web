import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW } from "@/tests/admin";
import {
  countLabel,
  hoursLabel,
  isOverdueItem,
  isShort,
  oversightOrder,
  percentLabel,
  shares,
} from "./report";

const item = (id: string, agoMs: number) => ({
  id,
  ref: id,
  suggested_by: { display_name: "Dr. Reyes" },
  specialty: "Paediatrics",
  submitted_at: new Date(NOW - agoMs).toISOString(),
  eligible_reviewers: 1,
  assigned_to: null,
  reminded_at: null,
});

describe("report maths", () => {
  it("shares out the confidence mix in whole percentages", () => {
    expect(
      shares({ high: 796, caution: 347, review: 103, failed: 38 }),
    ).toEqual({
      high: 62,
      caution: 27,
      review: 8,
      failed: 3,
    });
    expect(shares({ high: 0, caution: 0, review: 0, failed: 0 })).toBeNull();
  });

  it("formats rates, hours and counts", () => {
    expect(percentLabel(0.82)).toBe("82%");
    expect(hoursLabel(3.1)).toBe("3.1 h");
    expect(hoursLabel(3)).toBe("3 h");
    expect(hoursLabel(0.5)).toBe("30 min");
    expect(countLabel(1284)).toBe("1,284");
  });

  it("flags short of reviewers below 2, and overdue past the hospital's hours", () => {
    expect([isShort(0), isShort(1), isShort(2)]).toEqual([true, true, false]);
    expect(isOverdueItem(item("a", 5 * 3_600_000), 4, NOW)).toBe(true);
    expect(isOverdueItem(item("b", 3 * 3_600_000), 4, NOW)).toBe(false);
    expect(
      isOverdueItem({ ...item("c", 0), submitted_at: "bad" }, 4, NOW),
    ).toBe(false);
  });

  it("puts the oldest first", () => {
    expect(
      oversightOrder([
        item("new", 60_000),
        item("old", 9_000_000),
        item("mid", 600_000),
      ]).map((i) => i.id),
    ).toEqual(["old", "mid", "new"]);
  });
});
