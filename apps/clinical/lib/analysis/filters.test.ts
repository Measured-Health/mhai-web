import { describe, expect, it } from "vitest";
import type { AnalysisFilters } from "../api/analysis-contract";
import { FILTER_OPTIONS } from "../api/analysis-fixtures";
import {
  PERIODS,
  activeCount,
  customRangeProblem,
  defaultFilters,
  matchCondition,
  rangeFor,
  showSource,
} from "./filters";

const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };

describe("analysis filters", () => {
  it("offers the periods, last 90 days by default", () => {
    expect(PERIODS.map((p) => p.label)).toEqual([
      "Last 30 days",
      "Last 90 days",
      "Last 12 months",
      "Custom",
    ]);
    expect(defaultFilters("2026-10-22")).toEqual({
      from: "2026-07-24",
      to: "2026-10-22",
      condition: null,
      age_band: null,
      sex: null,
      location: null,
      setting: null,
      specialty: null,
      source: null,
    });
  });

  it("works out each preset's range", () => {
    expect(rangeFor("30d", "2026-10-22")).toEqual({
      from: "2026-09-22",
      to: "2026-10-22",
    });
    expect(rangeFor("90d", "2026-10-22")).toEqual({
      from: "2026-07-24",
      to: "2026-10-22",
    });
    expect(rangeFor("12m", "2026-10-22")).toEqual({
      from: "2025-10-22",
      to: "2026-10-22",
    });
    expect(rangeFor("12m", "2028-02-29")).toEqual({
      from: "2027-02-28",
      to: "2028-02-29",
    });
  });

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

  it("a custom range over 24 months is refused", () => {
    expect(customRangeProblem("2024-10-22", "2026-10-22")).toBeNull();
    expect(customRangeProblem("2024-10-21", "2026-10-22")).toMatch(/24 months/);
    expect(customRangeProblem("2026-10-22", "2026-10-22")).toBeNull();
    expect(customRangeProblem("2026-10-23", "2026-10-22")).toMatch(
      /on or before/,
    );
    expect(customRangeProblem("", "2026-10-22")).not.toBeNull();
    expect(customRangeProblem("2026-02-30", "2026-10-22")).not.toBeNull();
  });

  it("activeCount", () => {
    const f: AnalysisFilters = defaultFilters("2026-10-22");
    expect(activeCount(f)).toBe(0);
    expect(activeCount({ ...f, from: "2026-01-01" })).toBe(0);
    expect(
      activeCount({
        ...f,
        condition: "e11",
        sex: "female",
        source: "main_record",
      }),
    ).toBe(3);
    expect(
      activeCount({
        ...f,
        condition: "e11",
        age_band: "80+",
        sex: "female",
        location: "ward7",
        setting: "admitted",
        specialty: "Paediatrics",
        source: "main_record",
      }),
    ).toBe(7);
  });
});
