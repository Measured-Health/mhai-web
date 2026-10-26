import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AGuarded, HospitalRow } from "@/lib/api/analysis-contract";
import { HospitalRows } from "./hospital-rows";

afterEach(() => vi.unstubAllGlobals());

const shown = (value: number): AGuarded => ({ value, suppressed: false });
const HIDDEN: AGuarded = { value: null, suppressed: true };
function row(
  name: string,
  size: number,
  cases: number | null,
  partly = false,
): HospitalRow {
  const count = cases === null ? HIDDEN : shown(cases);
  return {
    hospital: { id: name.toLowerCase(), name },
    size: shown(size),
    kind: "general",
    coverage: "consultations_and_records",
    not_standardised_share: shown(partly ? 0.17 : 0.03),
    partly_standardised: partly,
    headline: {
      count,
      base: shown(size),
      per_1000:
        cases === null
          ? HIDDEN
          : shown(Math.round((cases * 10000) / size) / 10),
    },
  };
}
const ROWS = [
  row("Bravo", 800, 40),
  row("Alpha", 120, null),
  row("Delta", 1400, 20, true),
  row("Charlie", 600, 60),
];
const names = () =>
  within(screen.getByRole("table", { name: "By hospital" }))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

describe("HospitalRows", () => {
  it("starts in name order, so the order says nothing about size", () => {
    render(<HospitalRows rows={ROWS} headlineLabel="Cases per 1,000" />);
    expect(names()).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "DeltaPartly standardised",
    ]);
    expect(
      screen.getByRole("columnheader", { name: /Hospital/ }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(
      screen.getByRole("columnheader", { name: /Patients seen/ }),
    ).toHaveAttribute("aria-sort", "none");
  });

  it("sorts by a column both ways with aria-sort, hidden values always last", async () => {
    const user = userEvent.setup();
    render(<HospitalRows rows={ROWS} headlineLabel="Cases per 1,000" />);
    const head = screen.getByRole("columnheader", { name: /Cases per 1,000/ });
    await user.click(within(head).getByRole("button"));
    expect(head).toHaveAttribute("aria-sort", "descending");
    expect(names()).toEqual([
      "Charlie",
      "Bravo",
      "DeltaPartly standardised",
      "Alpha",
    ]);
    await user.click(within(head).getByRole("button"));
    expect(head).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual([
      "DeltaPartly standardised",
      "Bravo",
      "Charlie",
      "Alpha",
    ]);
  });

  it("writes the count beside the rate, and a hidden one in words", () => {
    render(<HospitalRows rows={ROWS} headlineLabel="Cases per 1,000" />);
    const cells = within(screen.getByRole("table", { name: "By hospital" }))
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[2]!.textContent);
    expect(cells).toEqual([
      "Fewer than 5",
      "50 per 1,000 · 40",
      "100 per 1,000 · 60",
      "14.3 per 1,000 · 20",
    ]);
  });

  it("reads Quality's agreement rate as a percentage", () => {
    render(
      <HospitalRows
        rows={[row("Alpha", 200, 150)]}
        headlineLabel="Agreement rate"
        headlineKind="share"
      />,
    );
    expect(screen.getByText("75% · 150")).toBeInTheDocument();
  });

  it("becomes cards with a sort choice on a phone", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const user = userEvent.setup();
    render(<HospitalRows rows={ROWS} headlineLabel="Cases per 1,000" />);
    expect(screen.queryByRole("table")).toBeNull();
    const list = screen.getByRole("list", { name: "By hospital" });
    const first = () =>
      within(list).getAllByRole("listitem")[0]!.querySelector("p")!.textContent;
    expect(first()).toBe("Alpha");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort hospitals by" }),
      "size",
    );
    expect(first()).toBe("DeltaPartly standardised");
    await user.click(screen.getByRole("button", { name: /Smallest first/ }));
    expect(first()).toBe("Alpha");
  });
});
