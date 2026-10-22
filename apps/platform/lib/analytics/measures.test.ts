import { describe, expect, it } from "vitest";
import { MEASURES } from "../api/analytics-contract";
import {
  COMPARE_MEASURES,
  MEASURE_KIND,
  measureLabel,
  measureText,
  minutesText,
  valueText,
} from "./measures";

const v = (value: number | null) => ({ value, suppressed: false });
const HIDDEN = { value: null, suppressed: true };

describe("measure labels", () => {
  it("every measure has a plain label and a kind", () => {
    for (const m of MEASURES) {
      expect(measureLabel(m)).toMatch(/^[A-Z][a-z]/);
      expect(MEASURE_KIND[m]).toBeDefined();
    }
  });

  it("names the measures in plain words", () => {
    expect(measureLabel("questions_per_clinician")).toBe(
      "Questions per active clinician",
    );
    expect(measureLabel("critical_median_ack_minutes")).toBe(
      "Critical median time to acknowledge",
    );
    expect(measureLabel("critical_within_target")).toBe(
      "Critical within target",
    );
    expect(measureLabel("needs_review_share")).toBe("Answers needing review");
    expect(measureLabel("median_review_hours")).toBe("Median review time");
  });

  it("the Hospitals tab compares four measures, in order", () => {
    expect(COMPARE_MEASURES).toEqual([
      "questions_per_clinician",
      "critical_median_ack_minutes",
      "critical_within_target",
      "needs_review_share",
    ]);
  });
});

describe("valueText", () => {
  it("hidden reads 'Fewer than 5' whatever the kind or value", () => {
    for (const k of ["count", "minutes", "share", "hours", "rate"] as const) {
      expect(valueText(HIDDEN, k)).toBe("Fewer than 5");
      expect(valueText({ value: 3, suppressed: true }, k)).toBe("Fewer than 5");
    }
  });

  it("0 shows; a count of 1–4 never does", () => {
    expect(valueText(v(0), "count")).toBe("0");
    for (const n of [1, 2, 3, 4])
      expect(valueText(v(n), "count")).toBe("Fewer than 5");
    expect(valueText(v(5), "count")).toBe("5");
  });

  it("nothing to show reads 'No data yet'", () => {
    expect(valueText(v(null), "share")).toBe("No data yet");
    expect(valueText(v(null), "count")).toBe("No data yet");
  });

  it("counts, minutes, shares, hours and rates", () => {
    expect(valueText(v(1234), "count")).toBe("1,234");
    expect(valueText(v(18), "minutes")).toBe("18 min");
    expect(valueText(v(65), "minutes")).toBe("1 h 5 min");
    expect(valueText(v(120), "minutes")).toBe("2 h");
    expect(valueText(v(0.62), "share")).toBe("62%");
    expect(valueText(v(3.5), "hours")).toBe("3.5 h");
    expect(valueText(v(14), "hours")).toBe("14 h");
    expect(valueText(v(2.34), "rate")).toBe("2.3");
  });

  it("minutes round to whole minutes", () => {
    expect(minutesText(17.6)).toBe("18 min");
    expect(minutesText(59.7)).toBe("1 h");
  });

  it("measureText picks the measure's kind", () => {
    expect(measureText("critical_median_ack_minutes", v(36))).toBe("36 min");
    expect(measureText("critical_within_target", v(0.55))).toBe("55%");
    expect(measureText("questions", HIDDEN)).toBe("Fewer than 5");
    expect(measureText("questions_per_clinician", v(1.5))).toBe("1.5");
  });
});
