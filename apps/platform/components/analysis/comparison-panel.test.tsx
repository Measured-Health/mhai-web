import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Comparison } from "@/lib/api/analysis-contract";
import { ComparisonPanel } from "./comparison-panel";

const g = (value: number | null, suppressed = false) => ({ value, suppressed });
const BASE: Comparison = {
  available: true,
  reason: null,
  peers: 5,
  current: g(18.2),
  previous: g(16),
  median: g(14.1),
  verdict: "higher",
  context: { size: g(2140), kind: "general", coverage: "consultations" },
};
const lines = () =>
  within(
    screen.getByRole("region", { name: "Compared with similar hospitals" }),
  )
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("ComparisonPanel", () => {
  it("the context, then last period, the median and the verdict with an icon", () => {
    render(<ComparisonPanel comparison={BASE} kind="rate" />);
    expect(lines()).toEqual([
      "2,140 patients seen · General hospital · MHAI consultations only",
      "Last period: 16 per 1,000",
      "Median of 5 similar hospitals: 14.1 per 1,000",
      "Higher than similar hospitals",
    ]);
    const verdict = screen.getByText("Higher than similar hospitals");
    expect(verdict.closest("li")!.querySelector("svg")).not.toBeNull();
  });

  it("no earlier data is not hidden; a hidden last period reads Fewer than 5", () => {
    const { unmount } = render(
      <ComparisonPanel
        comparison={{ ...BASE, previous: g(null) }}
        kind="rate"
      />,
    );
    expect(lines()[1]).toBe("Last period: No earlier data");
    unmount();
    render(
      <ComparisonPanel
        comparison={{ ...BASE, previous: g(null, true) }}
        kind="rate"
      />,
    );
    expect(lines()[1]).toBe("Last period: Fewer than 5");
  });

  it("not available: only the context and the reason", () => {
    render(
      <ComparisonPanel
        comparison={{
          ...BASE,
          available: false,
          reason: "small_group",
          peers: null,
          median: g(null, true),
          verdict: null,
        }}
        kind="rate"
      />,
    );
    expect(lines()).toEqual([
      "2,140 patients seen · General hospital · MHAI consultations only",
      "Not compared: too few patients",
    ]);
  });

  it("Quality compares the agreement rate as a percentage", () => {
    render(
      <ComparisonPanel
        comparison={{
          ...BASE,
          previous: g(700),
          median: g(756),
          verdict: "about_same",
        }}
        kind="share"
      />,
    );
    expect(lines().slice(1)).toEqual([
      "Last period: 70%",
      "Median of 5 similar hospitals: 76%",
      "About the same as similar hospitals",
    ]);
  });
});
