import { describe, expect, it } from "vitest";
import { daysLabel, isShorter, periodOptions, previewLine } from "./rules";

describe("settings rules", () => {
  it("daysLabel shows years, months or days", () => {
    expect(daysLabel(2190)).toBe("6 years");
    expect(daysLabel(365)).toBe("1 year");
    expect(daysLabel(180)).toBe("6 months");
    expect(daysLabel(30)).toBe("1 month");
    expect(daysLabel(45)).toBe("45 days");
    expect(daysLabel(1)).toBe("1 day");
  });

  it("periodOptions never goes below the minimum, and audit log offers 6–10 years only", () => {
    const all = periodOptions(1, 2190);
    expect(all).toEqual([
      30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365, 730, 1095, 1460,
      1825, 2190, 2555, 2920, 3285, 3650,
    ]);
    expect(periodOptions(365, 2190)[0]).toBe(365);
    expect(Math.min(...periodOptions(30, 365))).toBe(30);
    expect(periodOptions(2190, 2190).map(daysLabel)).toEqual([
      "6 years",
      "7 years",
      "8 years",
      "9 years",
      "10 years",
    ]);
    // Never below the minimum, whatever the current period.
    for (const min of [30, 45, 365, 2190])
      expect(periodOptions(min, 3650).every((d) => d >= min)).toBe(true);
  });

  it("periodOptions includes the current period, in order, once", () => {
    expect(periodOptions(30, 45)).toContain(45);
    const o = periodOptions(30, 45);
    expect(o).toEqual([...o].sort((a, b) => a - b));
    expect(new Set(periodOptions(365, 730)).size).toBe(
      periodOptions(365, 730).length,
    );
  });

  it("previewLine says how many records would be deleted and that holds keep theirs", () => {
    expect(previewLine(1095, 12300)).toBe(
      "With 3 years, about 12300 records would be deleted in the next clean-up. Records under a legal hold are kept.",
    );
  });

  it("isShorter compares with the current period", () => {
    expect(isShorter(365, 2190)).toBe(true);
    expect(isShorter(2555, 2190)).toBe(false);
    expect(isShorter(2190, 2190)).toBe(false);
  });
});
