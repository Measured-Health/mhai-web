import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Guarded } from "@/lib/api/analytics-contract";
import { readSeries } from "@/lib/analytics/read";
import { ComparePanel } from "./compare-chart";

const H = { id: "h_lakeside", name: "Lakeside Community Clinic" };
const shown = (value: number): Guarded => ({ value, suppressed: false });
const START = ["2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"];

function panel(medians: (number | null)[]) {
  const s = readSeries(
    {
      measure: "alerts_total",
      hospital: H,
      points: medians.map((median, i) => ({
        start: START[i],
        value: shown(40),
        median,
      })),
    },
    "alerts_total",
  );
  if (s.status !== "ok") throw new Error("failed");
  return render(
    <ComparePanel
      hospital={H}
      measure="alerts_total"
      points={s.points}
      size={null}
    />,
  );
}

describe("the compare chart", () => {
  it("draws no mark for a count median of 3 and says Fewer than 5", async () => {
    const { container } = panel([3, 20]);
    const marks = container.querySelectorAll("[data-median]");
    expect(marks).toHaveLength(1);
    // The hidden median isn't in the scale: 40 is the top.
    expect((marks[0] as HTMLElement).style.bottom).toBe("50%");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveAccessibleName(
      /median of the other hospitals Fewer than 5$/,
    );
    expect(items[0]).not.toHaveAccessibleName(/\b3\b/);
    await userEvent.click(
      screen.getByRole("button", { name: "Show as table" }),
    );
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Fewer than 5");
    expect(rows[2]).toHaveTextContent("20");
  });

  it("a big hidden median doesn't stretch the scale", () => {
    const { container } = panel([4.5, 4.5]);
    expect(container.querySelectorAll("[data-median]")).toHaveLength(0);
    expect(
      screen.getByText("Median of the other hospitals"),
    ).toBeInTheDocument();
  });
});
