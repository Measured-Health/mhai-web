import { describe, expect, it } from "vitest";
import {
  finishedPeriods,
  firstFiguresText,
  isPeriodStart,
  periodEnd,
  periodLabel,
  periodOf,
  periodRange,
  periodShort,
  windowOk,
  windowText,
} from "./periods";

const at = (s: string) => Date.parse(`${s}T00:00:00.000Z`);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("the reporting calendar (R41a-2)", () => {
  it("weeks are month-aligned: 1–7, 8–14, 15–21, 22 to the month's end", () => {
    for (const d of ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"])
      expect(isPeriodStart("week", `${d}T00:00:00.000Z`)).toBe(true);
    // A Monday that isn't a block start is no week.
    expect(isPeriodStart("week", "2026-10-05T00:00:00.000Z")).toBe(false);
    expect(day(periodEnd("week", at("2026-10-22")))).toBe("2026-11-01");
    expect(day(periodEnd("week", at("2026-02-22")))).toBe("2026-03-01");
    expect(day(periodEnd("week", at("2026-10-08")))).toBe("2026-10-15");
    expect(day(periodOf("week", at("2026-10-31")))).toBe("2026-10-22");
  });

  it("months and quarters; anything not at midnight UTC is no start", () => {
    expect(isPeriodStart("month", "2026-10-01T00:00:00.000Z")).toBe(true);
    expect(isPeriodStart("month", "2026-10-01T00:00:01.000Z")).toBe(false);
    expect(isPeriodStart("quarter", "2026-10-01T00:00:00.000Z")).toBe(true);
    expect(isPeriodStart("quarter", "2026-11-01T00:00:00.000Z")).toBe(false);
    expect(isPeriodStart("month", "nope")).toBe(false);
    expect(day(periodEnd("quarter", at("2026-10-01")))).toBe("2027-01-01");
    expect(day(periodOf("quarter", at("2026-08-15")))).toBe("2026-07-01");
  });

  it("finished periods: the one containing now isn't one", () => {
    const now = Date.parse("2026-11-11T09:30:00.000Z");
    expect(
      finishedPeriods("week", now, 3).map((p) => [day(p.from), day(p.to)]),
    ).toEqual([
      ["2026-10-15", "2026-10-22"],
      ["2026-10-22", "2026-11-01"],
      ["2026-11-01", "2026-11-08"],
    ]);
    expect(day(finishedPeriods("month", now, 1)[0]!.from)).toBe("2026-10-01");
    expect(day(finishedPeriods("quarter", now, 1)[0]!.from)).toBe("2026-07-01");
  });
});

describe("period labels (F3, F5, F15)", () => {
  it("weeks read as date ranges, never 'week of'", () => {
    expect(periodRange("week", "2026-10-22T00:00:00.000Z")).toBe(
      "22–31 Oct 2026",
    );
    expect(periodShort("week", "2026-10-22T00:00:00.000Z")).toBe("22–31 Oct");
    expect(periodLabel("week", "2026-10-22T00:00:00.000Z")).toBe(
      "Week 22–31 Oct 2026",
    );
  });

  it("months and quarters", () => {
    expect(periodLabel("month", "2026-10-01T00:00:00.000Z")).toBe(
      "Month 1–31 Oct 2026",
    );
    expect(periodShort("month", "2026-10-01T00:00:00.000Z")).toBe("Oct 2026");
    expect(periodRange("quarter", "2026-07-01T00:00:00.000Z")).toBe(
      "1 Jul–30 Sep 2026",
    );
    expect(periodShort("quarter", "2026-07-01T00:00:00.000Z")).toBe(
      "Jul–Sep 2026",
    );
    expect(firstFiguresText("month", "2026-12-01T00:00:00.000Z")).toBe(
      "First figures after 1–31 Dec 2026",
    );
  });

  it("What changed's window: a month against a later week", () => {
    const w = {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-08T00:00:00.000Z",
    };
    expect(windowOk(w)).toBe(true);
    expect(windowText(w)).toBe(
      "Week 1–7 Nov 2026 against Month 1–31 Oct 2026, per day",
    );
    expect(windowOk({ ...w, to: "2026-11-07T00:00:00.000Z" })).toBe(false);
    expect(windowOk({ ...w, from: "2026-11-01T00:00:00.000Z" })).toBe(false);
  });
});
