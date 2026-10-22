import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { describe, expect, it } from "vitest";
import { BarList } from "./bar-list";
import type { Column } from "./types";
import { ColumnChart } from "./column-chart";

const bars = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((li) => li.querySelector<HTMLElement>("[aria-hidden] > span"));

describe("BarList", () => {
  it("writes the number beside each bar and scales to the largest", () => {
    render(
      <BarList
        label="By specialty"
        items={[
          { key: "a", label: "Internal Medicine", value: 412, text: "412" },
          { key: "b", label: "Cardiology", value: 103, text: "103" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "By specialty" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Internal Medicine412", "Cardiology103"]);
    expect(bars(list).map((b) => b?.style.width)).toEqual(["100%", "25%"]);
  });

  it("writes Fewer than 5 and draws no bar for a hidden group, even with a value (Review Focus 2)", () => {
    render(
      <BarList
        label="Reasons"
        items={[
          { key: "a", label: "Already known", value: 9, text: "9" },
          {
            key: "b",
            label: "Wrong patient",
            value: 3,
            text: "3",
            hidden: true,
          },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Reasons" });
    const [shown, hidden] = within(list).getAllByRole("listitem");
    expect(shown).toHaveTextContent("Already known9");
    expect(hidden).toHaveTextContent(/^Wrong patientFewer than 5$/);
    expect(hidden!.querySelector("[aria-hidden]")).toBeNull();
    expect(list.textContent).not.toContain("3");
  });

  it("uses a fixed scale when given one, and says when there's nothing", () => {
    const { rerender } = render(
      <BarList
        label="Mix"
        max={100}
        items={[{ key: "a", label: "High confidence", value: 62, text: "62%" }]}
      />,
    );
    expect(
      bars(screen.getByRole("list", { name: "Mix" }))[0]?.style.width,
    ).toBe("62%");
    rerender(<BarList label="Mix" items={[]} />);
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });

  it("can switch the grow animation off for cards that never had it", () => {
    render(
      <BarList
        label="L"
        animate={false}
        items={[{ key: "a", label: "A", value: 1, text: "1" }]}
      />,
    );
    const bar = bars(screen.getByRole("list", { name: "L" }))[0]!;
    expect(bar.className).not.toContain("animate");
  });

  it("grows its bars only when motion is allowed", () => {
    render(
      <BarList
        label="L"
        items={[{ key: "a", label: "A", value: 1, text: "1" }]}
      />,
    );
    const bar = bars(screen.getByRole("list", { name: "L" }))[0]!;
    expect(bar.className).toContain(
      "motion-safe:animate-[grow_var(--t-story)_var(--e-out)_both]",
    );
  });
  it("writes a note under the label, never beside a hidden group (F8)", () => {
    render(
      <BarList
        label="Outcomes"
        items={[
          {
            key: "a",
            label: "Acknowledged",
            value: 0.82,
            text: "82%",
            note: "down 3 points vs last month",
          },
          {
            key: "d",
            label: "Dismissed",
            value: null,
            text: "",
            hidden: true,
            note: "up 3 points vs last month",
          },
        ]}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Outcomes" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows).toEqual([
      "Acknowledged82%down 3 points vs last month",
      "DismissedFewer than 5",
    ]);
  });
});

const COLUMNS: Column[] = [
  { key: "1", label: "12 Oct", value: 7 },
  { key: "2", label: "13 Oct", value: 8 },
  { key: "3", label: "14 Oct", value: 23, mark: "about 3× the usual" },
  { key: "4", label: "15 Oct", value: 0 },
];
const chart = (columns = COLUMNS) =>
  render(
    <ColumnChart
      title="Alerts over time"
      columns={columns}
      summary="Most alerts on 14 Oct: 23"
      valueText={(n) => (n === 1 ? "1 alert" : `${n} alerts`)}
      headers={["Day", "Alerts"]}
      markLegend="Unusually busy"
    />,
  );

describe("BarList edge cases", () => {
  it("ignores an unusable max", () => {
    for (const max of [NaN, 0, -5, Infinity]) {
      const { unmount } = render(
        <BarList
          label="L"
          max={max}
          items={[{ key: "a", label: "A", value: 5, text: "5" }]}
        />,
      );
      expect(
        bars(screen.getByRole("list", { name: "L" }))[0]?.style.width,
      ).toBe("100%");
      unmount();
    }
  });

  it("copes with only hidden items", () => {
    render(
      <BarList
        label="L"
        items={[{ key: "a", label: "A", value: 2, text: "2", hidden: true }]}
      />,
    );
    const list = screen.getByRole("list", { name: "L" });
    expect(list).toHaveTextContent("AFewer than 5");
    expect(list.innerHTML).not.toContain("NaN");
    expect(list.querySelector("[aria-hidden]")).toBeNull();
  });
});

describe("ColumnChart", () => {
  it("has a title, a text summary and a name for every column", () => {
    chart();
    const region = screen.getByRole("region", { name: "Alerts over time" });
    expect(within(region).getByText("Most alerts on 14 Oct: 23")).toBeVisible();
    const list = within(region).getByRole("list", { name: "Alerts over time" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual([
      "12 Oct: 7 alerts",
      "13 Oct: 8 alerts",
      "14 Oct: 23 alerts, about 3× the usual",
      "15 Oct: 0 alerts",
    ]);
    // Marked with a marker and a legend, never colour alone.
    expect(within(region).getByText("Unusually busy")).toBeVisible();
  });

  it("shows the same numbers as a table, and back", async () => {
    chart();
    const toggle = screen.getByRole("button", { name: "Show as table" });
    await userEvent.click(toggle);
    const table = screen.getByRole("table", { name: "Alerts over time" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Day", "Alerts", "Note"]);
    expect(
      within(table).getByRole("row", { name: "14 Oct 23 about 3× the usual" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    const back = screen.getByRole("button", { name: "Show as chart" });
    expect(back).toHaveFocus();
    await userEvent.click(back);
    expect(
      screen.getByRole("list", { name: "Alerts over time" }),
    ).toBeVisible();
  });

  it("is one tab stop, and the arrow keys, Home and End move between columns", async () => {
    chart();
    const items = screen.getAllByRole("listitem");
    expect(items.filter((li) => li.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab(); // the toggle
    await userEvent.tab(); // the columns
    expect(items[0]).toHaveFocus();
    expect(
      screen.getByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeVisible();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(items[2]).toHaveFocus();
    expect(
      screen.getByText("14 Oct: 23 alerts, about 3× the usual", {
        selector: "p",
      }),
    ).toBeVisible();
    await userEvent.keyboard("{End}");
    expect(items[3]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(items[0]).toHaveFocus();
    await userEvent.tab();
    expect(items).not.toContain(document.activeElement);
  });

  it("keeps one tab stop when the data shrinks (F1)", async () => {
    const { rerender } = chart();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{End}");
    rerender(
      <ColumnChart
        title="Alerts over time"
        columns={COLUMNS.slice(0, 2)}
        summary="s"
        valueText={(n) => `${n} alerts`}
        headers={["Day", "Alerts"]}
        markLegend="Unusually busy"
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.filter((li) => li.tabIndex === 0)).toHaveLength(1);
  });

  it("clears the caption when focus leaves", async () => {
    chart();
    await userEvent.tab();
    await userEvent.tab();
    expect(
      screen.getByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeVisible();
    await userEvent.tab();
    expect(
      screen.queryByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeNull();
  });

  it("has no stale caption after a hidden route comes back (F2)", async () => {
    const ui = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ColumnChart
          title="Alerts over time"
          columns={COLUMNS}
          summary="s"
          valueText={(n) => `${n} alerts`}
          headers={["Day", "Alerts"]}
          markLegend="Unusually busy"
        />
      </Activity>
    );
    const { rerender } = render(ui("visible"));
    await userEvent.tab();
    await userEvent.tab();
    expect(
      screen.getByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeVisible();
    rerender(ui("hidden"));
    rerender(ui("visible"));
    expect(
      screen.queryByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeNull();
  });

  it("drops the caption when a data swap removes the focused column", async () => {
    const { rerender } = chart();
    await userEvent.tab();
    await userEvent.tab();
    rerender(
      <ColumnChart
        title="Alerts over time"
        columns={[{ key: "x", label: "1 Nov", value: 2 }]}
        summary="s"
        valueText={(n) => `${n} alerts`}
        headers={["Day", "Alerts"]}
        markLegend="Unusually busy"
      />,
    );
    expect(
      screen.queryByText("12 Oct: 7 alerts", { selector: "p" }),
    ).toBeNull();
  });

  it("draws all-zero columns without NaN heights", () => {
    chart(COLUMNS.map((c) => ({ ...c, value: 0, mark: null })));
    for (const li of screen.getAllByRole("listitem"))
      expect(li.innerHTML).not.toContain("NaN");
  });

  it("writes one axis label for a single column", () => {
    chart([{ key: "1", label: "12 Oct", value: 4 }]);
    expect(screen.getAllByText("12 Oct", { selector: "span" })).toHaveLength(1);
  });

  it("has a phone layout: a shorter plot, end dates only and a 44px toggle", () => {
    chart();
    expect(screen.getByRole("list").className).toMatch(/\bh-28\b.*\bsm:h-40\b/);
    expect(
      screen.getByText("13 Oct", { selector: "span" }).className,
    ).toContain("hidden sm:inline");
    expect(
      screen.getByRole("button", { name: "Show as table" }).className,
    ).toContain("min-h-11");
  });

  it("grows its columns only when motion is allowed", () => {
    chart();
    const col = screen
      .getAllByRole("listitem")[0]!
      .querySelector("span:last-child")!;
    expect(col.className).toContain(
      "motion-safe:animate-[rise_var(--t-story)_var(--e-out)_both]",
    );
  });

  it("can leave the table to the page: no Show as table, the columns only", () => {
    render(
      <ColumnChart
        title="Cases over time"
        columns={COLUMNS}
        summary="s"
        valueText={(n) => `${n} cases`}
        headers={["Week", "Cases"]}
        markLegend=""
        tableToggle={false}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("list", { name: "Cases over time" })).toBeVisible();
  });

  it("shows only the summary when there are no columns", () => {
    chart([]);
    expect(screen.getByText("Most alerts on 14 Oct: 23")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("a hidden column reads Fewer than 5 everywhere, never 0, and draws no column", async () => {
    const { container } = chart([
      { key: "1", label: "12 Oct", value: 7 },
      { key: "2", label: "13 Oct", value: 0, hidden: true },
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAccessibleName("13 Oct: Fewer than 5");
    expect(
      items[1]!.querySelector("span[aria-hidden].block")!.getAttribute("style"),
    ).toMatch(/height:\s*0/);
    await userEvent.click(
      screen.getByRole("button", { name: "Show as table" }),
    );
    const row = screen.getByRole("row", { name: /13 Oct/ });
    expect(within(row).getByText("Fewer than 5")).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/\b0\b/);
    expect(container.textContent).not.toContain("0 alerts");
  });
});
