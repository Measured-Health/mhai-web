import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./data-table";

afterEach(() => vi.unstubAllGlobals());

const props = {
  caption: "Cases by condition",
  columns: [
    { key: "name", label: "Condition" },
    { key: "cases", label: "Cases", numeric: true },
    { key: "rate", label: "Per 1,000", numeric: true },
  ],
  rows: [
    {
      id: "e11",
      cells: {
        name: "Type 2 diabetes",
        cases: { g: { value: 140, suppressed: false }, kind: "count" as const },
        rate: { g: { value: 12.44, suppressed: false }, kind: "rate" as const },
      },
    },
    {
      id: "d57",
      cells: {
        name: "Sickle cell disease",
        cases: { g: { value: null, suppressed: true }, kind: "count" as const },
        rate: {
          g: {
            value: null,
            suppressed: true,
            why: "too_few_hospitals" as const,
          },
          kind: "rate" as const,
        },
      },
    },
  ],
};

describe("DataTable", () => {
  it("is a table on md and up, hidden cells in words", () => {
    render(<DataTable {...props} />);
    const table = screen.getByRole("table", { name: "Cases by condition" });
    const rows = within(table)
      .getAllByRole("row")
      .map((r) => [...r.querySelectorAll("th, td")].map((c) => c.textContent));
    expect(rows).toEqual([
      ["Condition", "Cases", "Per 1,000"],
      ["Type 2 diabetes", "140", "12.4 per 1,000"],
      ["Sickle cell disease", "Fewer than 5", "Too few hospitals to show"],
    ]);
  });

  it("is cards below md, with the same numbers", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<DataTable {...props} />);
    expect(screen.queryByRole("table")).toBeNull();
    const list = screen.getByRole("list", { name: "Cases by condition" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveTextContent("Sickle cell disease");
    expect(cards[1]).toHaveTextContent("CasesFewer than 5");
    expect(cards[1]).toHaveTextContent("Per 1,000Too few hospitals to show");
  });
});
