import { describe, expect, it } from "vitest";
import type { AnalysisStatus, Comparison } from "../api/analysis-contract";
import {
  AGE_LABEL,
  COVERAGE_LABEL,
  EXCLUDED_TEXT,
  KIND_LABEL,
  VIEWS,
  VIEW_TITLE,
  comparisonLines,
  conditionText,
  failedText,
  includedText,
  locationText,
  monthsText,
  periodLabel,
  valueText,
} from "./labels";

const g = (value: number) => ({ value, suppressed: false });
const HID = { value: null, suppressed: true };
const FEW = {
  value: null,
  suppressed: true,
  why: "too_few_hospitals" as const,
};

const comparison = (over: Partial<Comparison> = {}): Comparison => ({
  available: true,
  reason: null,
  peers: 5,
  current: g(124.3),
  previous: g(118),
  median: g(101.2),
  verdict: "higher",
  context: {
    size: g(2140),
    kind: "general",
    coverage: "consultations_and_records",
  },
  ...over,
});

describe("the views", () => {
  it("in page order, with plain titles", () => {
    expect(VIEWS).toEqual([
      "prevalence",
      "affected",
      "co-occurring",
      "findings",
      "quality",
    ]);
    expect(VIEW_TITLE.prevalence).toBe("Prevalence and trends");
    expect(failedText("prevalence")).toBe(
      "Couldn't load prevalence and trends",
    );
    expect(failedText("affected")).toBe("Couldn't load who is affected");
    expect(failedText("quality")).toBe("Couldn't load MHAI quality");
  });
});

describe("periods, groups and names", () => {
  it("Oct 2025 to Sep 2026", () => {
    expect(monthsText({ from: "2025-10-01", to: "2026-09-30" })).toBe(
      "Oct 2025 to Sep 2026",
    );
    expect(periodLabel("3m")).toBe("Last 3 months");
    expect(periodLabel("6m")).toBe("Last 6 months");
    expect(periodLabel("12m")).toBe("Last 12 months");
  });

  it("both sets of age bands", () => {
    expect(AGE_LABEL["0-19"]).toBe("0–19");
    expect(AGE_LABEL["18-39"]).toBe("18–39");
    expect(AGE_LABEL["80+"]).toBe("80 and over");
  });

  it("conditions, locations, kinds and coverage", () => {
    expect(
      conditionText({ id: "e11", name: "Type 2 diabetes", icd10: "E11" }),
    ).toBe("Type 2 diabetes · E11");
    expect(conditionText({ id: "unmapped", name: null, icd10: "X99" })).toBe(
      "Not standardised",
    );
    expect(locationText(null)).toBe("Location not recorded");
    expect(
      locationText({ id: "ward4", label: "Ward 4", setting: "admitted" }),
    ).toBe("Ward 4");
    expect(KIND_LABEL).toEqual({
      general: "General hospital",
      specialist: "Specialist hospital",
      teaching: "Teaching hospital",
    });
    expect(COVERAGE_LABEL).toEqual({
      consultations: "MHAI consultations only",
      consultations_and_records: "Consultations and connected records",
    });
    expect(EXCLUDED_TEXT).toEqual({
      not_covered: "Not covered by its agreement",
      not_enough_data: "Not enough data yet",
    });
  });
});

describe("valueText", () => {
  it("Too few hospitals to show", () => {
    expect(valueText(FEW, "count")).toBe("Too few hospitals to show");
    expect(valueText(FEW, "rate")).toBe("Too few hospitals to show");
  });

  it("Fewer than 5 for a hidden count; Not shown for a hidden rate or share", () => {
    expect(valueText(HID, "count")).toBe("Fewer than 5");
    expect(valueText(HID, "rate")).toBe("Not shown");
    expect(valueText(HID, "share")).toBe("Not shown");
    // A shown 1–4 still never shows.
    expect(valueText(g(3), "count")).toBe("Fewer than 5");
    expect(valueText(g(0), "count")).toBe("0");
  });

  it("12.4 per 1,000", () => {
    expect(valueText(g(12.4), "rate")).toBe("12.4 per 1,000");
    expect(valueText(g(12), "rate")).toBe("12 per 1,000");
    expect(valueText(g(1234.56), "rate")).toBe("1,234.6 per 1,000");
    expect(valueText(g(2140), "count")).toBe("2,140");
    expect(valueText(g(0.62), "share")).toBe("62%");
    expect(valueText({ value: null, suppressed: false }, "rate")).toBe(
      "No data yet",
    );
  });
});

describe("comparisonLines", () => {
  it("the four reason texts", () => {
    const reason = (r: Comparison["reason"]) =>
      comparisonLines(
        comparison({
          available: false,
          reason: r,
          peers: null,
          median: HID,
          verdict: null,
        }),
        "rate",
      ).reason;
    expect(reason("too_few_peers")).toBe(
      "Not enough similar hospitals to compare",
    );
    expect(reason("partly_standardised")).toBe(
      "Not compared: partly standardised",
    );
    expect(reason("too_little_history")).toBe(
      "Not compared: under 3 months of data",
    );
    expect(reason("small_group")).toBe("Not compared: too few patients");
  });

  it("not available: no median and no verdict", () => {
    const c = comparisonLines(
      comparison({
        available: false,
        reason: "too_few_peers",
        peers: 3,
        median: HID,
        verdict: null,
      }),
      "rate",
    );
    expect(c.median).toBeNull();
    expect(c.verdict).toBeNull();
  });

  it("Higher than similar hospitals, About the same as similar hospitals", () => {
    expect(comparisonLines(comparison(), "rate").verdict).toBe(
      "Higher than similar hospitals",
    );
    expect(
      comparisonLines(comparison({ verdict: "about_same" }), "rate").verdict,
    ).toBe("About the same as similar hospitals");
    expect(
      comparisonLines(comparison({ verdict: "lower" }), "rate").verdict,
    ).toBe("Lower than similar hospitals");
  });

  it("Median of 5 similar hospitals", () => {
    const c = comparisonLines(comparison(), "rate");
    expect(c.median).toBe("Median of 5 similar hospitals: 101.2 per 1,000");
    expect(c.reason).toBeNull();
  });

  it("the previous period first; no earlier data is not hidden", () => {
    expect(comparisonLines(comparison(), "rate").previous).toBe(
      "Last period: 118 per 1,000",
    );
    expect(
      comparisonLines(
        comparison({ previous: { value: null, suppressed: false } }),
        "rate",
      ).previous,
    ).toBe("Last period: No earlier data");
    expect(
      comparisonLines(comparison({ previous: HID }), "rate").previous,
    ).toBe("Last period: Not shown");
  });

  it("the context line", () => {
    expect(comparisonLines(comparison(), "rate").context).toBe(
      "2,140 patients seen · General hospital · Consultations and connected records",
    );
    expect(
      comparisonLines(
        comparison({
          context: { size: HID, kind: "specialist", coverage: "consultations" },
        }),
        "rate",
      ).context,
    ).toBe(
      "Fewer than 5 patients seen · Specialist hospital · MHAI consultations only",
    );
  });

  it("Quality's agreement rate reads as a percentage", () => {
    const c = comparisonLines(
      comparison({ current: g(756), previous: g(700), median: g(812.5) }),
      "share",
    );
    expect(c.previous).toBe("Last period: 70%");
    expect(c.median).toBe("Median of 5 similar hospitals: 81%");
  });
});

describe("includedText", () => {
  it("10 of 12 hospitals included", () => {
    const s = {
      hospitals: { included: 10, total: 12, list: [], excluded: [] },
    } as unknown as AnalysisStatus;
    expect(includedText(s)).toBe("10 of 12 hospitals included");
  });
});
