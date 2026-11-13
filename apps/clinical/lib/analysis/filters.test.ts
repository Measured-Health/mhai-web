import { describe, expect, it } from "vitest";
import type {
  AnalysisFilters,
  FilterOptionsOut,
} from "../api/analysis-contract";
import { FILTER_OPTIONS } from "../api/analysis-fixtures";
import {
  CAP_REASON,
  LOCATION_OR_SETTING,
  activeCount,
  defaultPeriod,
  emptyFilters,
  filterBlocked,
  levelsOf,
  matchCondition,
  periodsOf,
  pruneFilters,
  showSource,
} from "./filters";

const E11 = FILTER_OPTIONS.conditions.find((c) => c.id === "e11")!;
const Q3: AnalysisFilters = emptyFilters({
  level: "quarter",
  start: "2026-07-01",
});
const NO_PERIODS: FilterOptionsOut["periods"] = {
  week: [],
  month: [],
  quarter: [],
};

describe("analysis filters", () => {
  it("E11 finds Type 2 diabetes; 'diab' finds it by name", () => {
    expect(matchCondition(E11, "E11")).toBe(true);
    expect(matchCondition(E11, "e11")).toBe(true);
    expect(matchCondition(E11, "diab")).toBe(true);
    expect(matchCondition(E11, " DIAB ")).toBe(true);
    expect(matchCondition(E11, "asthma")).toBe(false);
    expect(matchCondition(E11, "")).toBe(true);
    expect(
      FILTER_OPTIONS.conditions.filter((c) => matchCondition(c, "E11")),
    ).toEqual([E11]);
    expect(
      matchCondition({ id: "unmapped", name: null, icd10: null }, "standard"),
    ).toBe(true);
  });

  it("source shows only with two or more", () => {
    expect(showSource(FILTER_OPTIONS)).toBe(true);
    expect(
      showSource({
        ...FILTER_OPTIONS,
        sources: FILTER_OPTIONS.sources.slice(0, 1),
      }),
    ).toBe(false);
    expect(showSource({ ...FILTER_OPTIONS, sources: [] })).toBe(false);
  });

  it("activeCount counts the filters, never the period", () => {
    expect(activeCount(Q3)).toBe(0);
    expect(activeCount({ ...Q3, condition: "e11", sex: "female" })).toBe(2);
  });

  it("a third filter is refused, and so is a location with a setting", () => {
    const one = { ...Q3, sex: "female" as const };
    expect(filterBlocked(one, "condition")).toBeNull();
    const two = { ...one, condition: "e11" };
    expect(filterBlocked(two, "age_band")).toBe(CAP_REASON);
    // A filter already set can still be changed or cleared.
    expect(filterBlocked(two, "sex")).toBeNull();
    const ward = { ...Q3, location: "ward4" };
    expect(filterBlocked(ward, "setting")).toBe(LOCATION_OR_SETTING);
    expect(
      filterBlocked({ ...Q3, setting: "admitted" as const }, "location"),
    ).toBe(LOCATION_OR_SETTING);
  });

  it("an id the period doesn't list is taken out; codes are kept", () => {
    const f: AnalysisFilters = {
      ...Q3,
      condition: "gone",
      location: "nowhere",
      specialty: "not_listed",
      source: "elsewhere",
      sex: "male",
    };
    expect(pruneFilters(f, FILTER_OPTIONS)).toEqual({
      ...Q3,
      sex: "male",
    });
    const kept = { ...Q3, condition: "e11", location: "ward4" };
    expect(pruneFilters(kept, FILTER_OPTIONS)).toEqual(kept);
  });

  it("the default is the latest finished month, then week, then quarter", () => {
    const p = FILTER_OPTIONS.periods;
    expect(defaultPeriod(p)).toEqual({
      level: "month",
      start: p.month[p.month.length - 1],
    });
    expect(defaultPeriod({ ...NO_PERIODS, week: ["2026-10-08"] })).toEqual({
      level: "week",
      start: "2026-10-08",
    });
    expect(defaultPeriod(NO_PERIODS)).toBeNull();
    expect(levelsOf({ ...NO_PERIODS, quarter: ["2026-07-01"] })).toEqual([
      "quarter",
    ]);
  });

  it("the picker lists only the answerable periods, newest first", () => {
    expect(
      periodsOf(
        { ...NO_PERIODS, month: ["2026-08-01", "2026-09-01"] },
        "month",
      ),
    ).toEqual([
      { level: "month", start: "2026-09-01" },
      { level: "month", start: "2026-08-01" },
    ]);
  });
});
