import { describe, expect, it } from "vitest";
import {
  isPeriodStart,
  nextPeriod,
  periodLabel,
  periodOf,
  periodSpan,
  periodsWithin,
  prevPeriod,
} from "./periods";

describe("analysis periods (R41a)", () => {
  it("weeks are month-aligned blocks: 1–7, 8–14, 15–21, 22 to the end", () => {
    for (const d of ["01", "08", "15", "22"])
      expect(isPeriodStart("week", `2026-02-${d}`)).toBe(true);
    for (const d of ["02", "07", "29"])
      expect(isPeriodStart("week", `2026-02-${d}`)).toBe(false);
    expect(periodSpan({ level: "week", start: "2026-02-22" })).toEqual({
      from: "2026-02-22",
      to: "2026-02-28",
    });
    expect(periodSpan({ level: "week", start: "2028-02-22" }).to).toBe(
      "2028-02-29",
    );
    expect(periodSpan({ level: "week", start: "2026-10-22" }).to).toBe(
      "2026-10-31",
    );
    expect(periodSpan({ level: "week", start: "2026-10-08" }).to).toBe(
      "2026-10-14",
    );
  });

  it("months and quarters start on their first day", () => {
    expect(isPeriodStart("month", "2026-09-01")).toBe(true);
    expect(isPeriodStart("month", "2026-09-02")).toBe(false);
    expect(isPeriodStart("quarter", "2026-07-01")).toBe(true);
    expect(isPeriodStart("quarter", "2026-08-01")).toBe(false);
    expect(isPeriodStart("month", "2026-02-30")).toBe(false);
    expect(periodSpan({ level: "quarter", start: "2026-10-01" })).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });

  it("steps back and forward one period at a time", () => {
    expect(prevPeriod({ level: "week", start: "2026-10-01" })).toEqual({
      level: "week",
      start: "2026-09-22",
    });
    expect(nextPeriod({ level: "week", start: "2026-09-22" })).toEqual({
      level: "week",
      start: "2026-10-01",
    });
    expect(prevPeriod({ level: "quarter", start: "2026-01-01" })).toEqual({
      level: "quarter",
      start: "2025-10-01",
    });
    expect(periodOf("week", "2026-10-31")).toEqual({
      level: "week",
      start: "2026-10-22",
    });
  });

  it("lists only whole periods inside a span", () => {
    expect(
      periodsWithin("month", "2025-10-22", "2026-01-31").map((p) => p.start),
    ).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
    expect(
      periodsWithin("quarter", "2025-10-22", "2026-10-21").map((p) => p.start),
    ).toEqual(["2026-01-01", "2026-04-01", "2026-07-01"]);
  });

  it("reads in words", () => {
    expect(periodLabel({ level: "week", start: "2026-10-22" })).toBe(
      "22–31 Oct 2026",
    );
    expect(periodLabel({ level: "month", start: "2026-09-01" })).toBe(
      "September 2026",
    );
    expect(periodLabel({ level: "quarter", start: "2026-07-01" })).toBe(
      "Jul–Sep 2026",
    );
  });
});
