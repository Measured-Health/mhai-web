import { QueryClient } from "@tanstack/react-query";
import { render as rtl, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisQuery, Rate } from "@/lib/api/analysis-contract";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import type { AnalysisMode } from "@/lib/api/mock-analysis";
import { emptyQuery } from "@/lib/analysis/filters";
import { monthLabel } from "@/lib/analysis/labels";
import { readView, type ViewRead } from "@/lib/analysis/read";
import { ADA, GrabAuth, renderWithAuth } from "@/tests/render";
import { AnalysisGate } from "./analysis-gate";
import { PrevalenceView } from "./prevalence-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/analysis",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let api: PlatformClient;
function install(analysis: AnalysisMode = "normal") {
  api = createMockPlatform({ delayMs: 0, me: () => ADA.email, analysis });
  __setPlatformClientForTests(api);
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render() {
  renderWithAuth(
    <>
      <GrabAuth />
      <AnalysisGate />
    </>,
    {
      user: ADA,
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
  );
}
const select = (name: string) =>
  screen.getByRole("combobox", { name }) as HTMLSelectElement;
async function loaded() {
  await screen.findByRole("heading", {
    level: 2,
    name: "Prevalence and trends",
  });
  await screen.findByText(/^Updated \d\d:\d\d$/);
}
/** The hospital rows, by hospital name, as their cells' text. */
function hospitalRows() {
  const table = screen.getByRole("table", { name: "By hospital" });
  const [, ...rows] = within(table).getAllByRole("row");
  return new Map(
    rows.map((r) => {
      const cells = within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent ?? "");
      return [cells[0]!.replace("Partly standardised", ""), cells] as const;
    }),
  );
}
async function pickCondition(code: string, name: RegExp) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox", { name: "Condition" }), code);
  await user.click(
    within(screen.getByRole("listbox", { name: "Conditions" })).getByRole(
      "option",
      { name },
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Remove .*${code}`, "i"),
      }),
    ).toBeInTheDocument(),
  );
}
async function pickHospital(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "One hospital" }));
  await user.selectOptions(select("Hospital"), name);
  return screen.findByRole("region", {
    name: "Compared with similar hospitals",
  });
}
const lines = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole("listitem")
    .map((li) => li.textContent);

const RATE_AND_COUNT =
  /^(?:[\d,.]+ per 1,000 · [\d,]+|Not shown · [\d,]+|Fewer than 5)$/;

describe("Prevalence and trends", () => {
  it("All hospitals: the rate line, conditions, and one row per hospital with size, kind and coverage", async () => {
    render();
    await loaded();
    expect(
      screen.getByText(
        /^Cases per 1,000 patients seen, [A-Z][a-z]{2} \d{4} to [A-Z][a-z]{2} \d{4}: [\d,.]+ per 1,000 \([\d,]+ cases among [\d,]+ patients seen\)\.$/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    ).toBeInTheDocument();
    const conditions = within(
      screen.getByRole("list", { name: "By condition" }),
    ).getAllByRole("listitem");
    expect(conditions.length).toBeGreaterThan(3);
    expect(conditions[0]!.textContent).toMatch(/new in this period/);
    const rows = hospitalRows();
    expect(rows.size).toBe(10);
    const havana = rows.get("Havana Hospital")!;
    expect(havana[1]).toMatch(/^[\d,]+$/);
    expect(havana[3]).toBe("General hospital");
    expect(havana[4]).toBe("Consultations and connected records");
    expect(havana[5]).toMatch(/^\d+%$/);
    expect(rows.get("Lakeside Community Clinic")![4]).toBe(
      "MHAI consultations only",
    );
    expect(rows.get("Riverside Children's Hospital")![3]).toBe(
      "Specialist hospital",
    );
    // No comparison across hospitals.
    expect(
      screen.queryByRole("region", { name: "Compared with similar hospitals" }),
    ).toBeNull();
  });

  it("Southpoint shows Partly standardised", async () => {
    render();
    await loaded();
    const table = screen.getByRole("table", { name: "By hospital" });
    const chips = within(table).getAllByText("Partly standardised");
    expect(chips).toHaveLength(1);
    const row = chips[0]!.closest("tr")!;
    expect(row.textContent).toContain("Southpoint Hospital");
    // An icon as well as the words.
    expect(chips[0]!.closest("span")!.querySelector("svg")).not.toBeNull();
  });

  it("counts always show beside rates across hospitals", async () => {
    render();
    await loaded();
    for (const [, cells] of hospitalRows())
      expect(cells[2]).toMatch(RATE_AND_COUNT);
    const bars = within(
      screen.getByRole("list", { name: "By condition" }),
    ).getAllByRole("listitem");
    for (const b of bars)
      expect(b.querySelector("b")!.textContent).toMatch(
        /^(?:[\d,.]+ per 1,000 · [\d,]+|Not shown · [\d,]+|Fewer than 5|Too few hospitals to show)$/,
      );
  });

  it("Sickle cell disease: Lakeside and Harbour View read Fewer than 5", async () => {
    render();
    await loaded();
    await pickCondition("d57", /Sickle cell disease/);
    await waitFor(() =>
      expect(hospitalRows().get("Lakeside Community Clinic")![2]).toBe(
        "Fewer than 5",
      ),
    );
    expect(hospitalRows().get("Harbour View Hospital")![2]).toBe(
      "Fewer than 5",
    );
    // Hidden rows sort last whichever way, so their place says nothing.
    const user = userEvent.setup();
    const header = screen.getByRole("columnheader", {
      name: /Cases per 1,000/,
    });
    await user.click(within(header).getByRole("button"));
    const order = () =>
      [...hospitalRows().entries()].map(([n, c]) => [n, c[2]]);
    const tail = order().slice(-2);
    expect(tail.every(([, v]) => v === "Fewer than 5")).toBe(true);
    await user.click(within(header).getByRole("button"));
    expect(order().slice(-2)).toEqual(tail);
  });

  it("Tuberculosis across hospitals reads Too few hospitals to show", async () => {
    render();
    await loaded();
    await pickCondition("a15", /Tuberculosis/);
    expect(
      await screen.findByText(
        /^Cases per 1,000 patients seen, .*: Too few hospitals to show\.$/,
      ),
    ).toBeInTheDocument();
    const bar = within(
      screen.getByRole("list", { name: "By condition" }),
    ).getByText(/Tuberculosis/);
    expect(bar.closest("li")!.textContent).toContain(
      "Too few hospitals to show",
    );
    // The bar reads in words: no rate and no bar.
    expect(bar.closest("li")!.textContent).not.toMatch(/per 1,000/);
    expect(bar.closest("li")!.querySelector("[aria-hidden]")).toBeNull();
  });

  it("Havana: the previous period first, then the median of 5 similar hospitals, then the verdict in words", async () => {
    render();
    await loaded();
    const panel = await pickHospital("Havana Hospital");
    await waitFor(() => expect(lines(panel)).toHaveLength(4));
    const [context, previous, median, verdict] = lines(panel);
    expect(context).toMatch(
      /^[\d,]+ patients seen · General hospital · Consultations and connected records$/,
    );
    expect(previous).toMatch(
      /^Last period: ([\d,.]+ per 1,000|No earlier data)$/,
    );
    expect(median).toMatch(
      /^Median of 5 similar hospitals: [\d,.]+ per 1,000$/,
    );
    expect(verdict).toMatch(
      /^(Higher than|Lower than|About the same as) similar hospitals$/,
    );
    const icon = within(panel)
      .getAllByRole("listitem")[3]!
      .querySelector("svg");
    expect(icon).not.toBeNull();
    expect(panel.textContent).not.toMatch(/worse|sicker/i);
    // The median shows as a second mark on the chart.
    const months = within(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    ).getAllByRole("listitem");
    expect(
      months.some((m) =>
        /Median of similar hospitals: /.test(m.getAttribute("aria-label")!),
      ),
    ).toBe(true);
    // One hospital: no hospital rows.
    expect(screen.queryByRole("table", { name: "By hospital" })).toBeNull();
  });

  it("few_peers: Not enough similar hospitals to compare, with no median", async () => {
    install("few_peers");
    render();
    await loaded();
    const panel = await pickHospital("Havana Hospital");
    await waitFor(() =>
      expect(lines(panel)).toEqual([
        expect.stringMatching(/patients seen · General hospital/),
        "Not enough similar hospitals to compare",
      ]),
    );
    expect(panel.textContent).not.toMatch(/Median|Last period/);
    expect(
      within(screen.getByRole("list", { name: "Cases per 1,000 by month" }))
        .getAllByRole("listitem")
        .some((m) => /Median/.test(m.getAttribute("aria-label")!)),
    ).toBe(false);
  });

  it("Riverside, Southpoint and Fairhaven show their reasons", async () => {
    render();
    await loaded();
    const cases: [string, string, string][] = [
      [
        "Riverside Children's Hospital",
        "Specialist hospital",
        "Not enough similar hospitals to compare",
      ],
      [
        "Southpoint Hospital",
        "General hospital",
        "Not compared: partly standardised",
      ],
      [
        "Fairhaven General Hospital",
        "General hospital",
        "Not compared: under 3 months of data",
      ],
    ];
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "One hospital" }));
    for (const [name, kind, reason] of cases) {
      await user.selectOptions(select("Hospital"), name);
      const panel = await screen.findByRole("region", {
        name: "Compared with similar hospitals",
      });
      await waitFor(() => expect(lines(panel)[1]).toBe(reason));
      expect(lines(panel)).toHaveLength(2);
      expect(lines(panel)[0]).toContain(kind);
    }
  });

  it("Table shows the same numbers", async () => {
    render();
    await loaded();
    const months = within(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    )
      .getAllByRole("listitem")
      .map((m) => m.getAttribute("aria-label")!);
    const bars = within(screen.getByRole("list", { name: "By condition" }))
      .getAllByRole("listitem")
      .map((li) => li.querySelector("b")!.textContent!);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Table" }));
    const monthTable = screen.getByRole("table", {
      name: "Cases per 1,000 by month",
    });
    const monthRows = within(monthTable).getAllByRole("row").slice(1);
    expect(monthRows).toHaveLength(months.length);
    monthRows.forEach((r, i) => {
      const cells = within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent);
      expect(months[i]).toBe(`${cells[0]}: ${cells[3]}`);
    });
    const condTable = screen.getByRole("table", { name: "By condition" });
    expect(
      within(condTable)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Condition", "ICD-10", "Cases", "Cases per 1,000", "New"]);
    const condRows = within(condTable).getAllByRole("row").slice(1);
    expect(condRows).toHaveLength(bars.length);
    condRows.forEach((r, i) => {
      const c = within(r)
        .getAllByRole("cell")
        .map((x) => x.textContent);
      const shown = c[3] === c[2] ? c[3] : `${c[3]} · ${c[2]}`; // both hidden read once
      expect(bars[i]).toBe(shown);
    });
    // The hospital rows stay, with the same figures.
    expect(screen.getByRole("table", { name: "By hospital" })).toBeVisible();
  });

  it("a failing prevalence shows Couldn't load prevalence and trends and no zeros", async () => {
    install({ failView: "prevalence" });
    render();
    expect(
      await screen.findByText("Couldn't load prevalence and trends"),
    ).toBeInTheDocument();
    const section = screen
      .getByRole("heading", { level: 2, name: "Prevalence and trends" })
      .closest("section")!;
    expect(section.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole("table", { name: "By hospital" })).toBeNull();
    expect(screen.queryByRole("list", { name: "By condition" })).toBeNull();
    expect(screen.queryByText(/per 1,000/)).toBeNull();
  });
});

describe("PrevalenceView on its own", () => {
  const ALL = emptyQuery("all", null);
  async function readAll(q: AnalysisQuery = ALL) {
    const raw = await api.getAnalysisView("prevalence", q);
    const read = readView("prevalence", raw, q);
    if (read.status !== "ok") throw new Error("the sample should read");
    return read;
  }
  const hidden = { value: null, suppressed: true };
  const zero = (base: number): Rate => ({
    count: { value: 0, suppressed: false },
    base: { value: base, suppressed: false },
    per_1000: { value: 0, suppressed: false },
  });

  it("a hidden month reads Fewer than 5 with no column, beside a real 0", async () => {
    const read = await readAll();
    const series = read.data.data.series;
    series[0] = {
      ...series[0]!,
      rate: { count: hidden, base: hidden, per_1000: hidden },
    };
    series[1] = { ...series[1]!, rate: zero(120) };
    const state = read as ViewRead<"prevalence">;
    rtl(
      <PrevalenceView
        state={state}
        onRetry={() => {}}
        mode="chart"
        onMode={() => {}}
      />,
    );
    const [first, second] = within(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    ).getAllByRole("listitem");
    expect(first!.getAttribute("aria-label")).toMatch(/: Fewer than 5$/);
    expect(
      first!.querySelector("span[aria-hidden].block")!.getAttribute("style"),
    ).toMatch(/height:\s*0/);
    expect(second!.getAttribute("aria-label")).toMatch(/: 0 per 1,000$/);
    // The summary never names the hidden month, only that one is hidden.
    const summary = screen.getByText(/^Highest in /).textContent!;
    expect(summary).toContain("1 month reads Fewer than 5.");
    expect(summary).not.toContain(
      first!.getAttribute("aria-label")!.split(":")[0]!,
    );
  });

  const alone = (state: ViewRead<"prevalence">, mode: "chart" | "table") =>
    rtl(
      <PrevalenceView
        state={state}
        onRetry={() => {}}
        mode={mode}
        onMode={() => {}}
      />,
    );

  it("One hospital: a hidden monthly median reads Not enough similar hospitals", async () => {
    const read = await readAll(emptyQuery("hospital", "h_havana"));
    expect(read.data.comparison?.available).toBe(true);
    const series = read.data.data.series;
    series[2] = { ...series[2]!, median: hidden };
    const month = monthLabel(series[2]!.month);
    const { unmount } = alone(read, "chart");
    const items = within(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    ).getAllByRole("listitem");
    expect(items[2]!.getAttribute("aria-label")).toMatch(
      /, Median of similar hospitals: Not enough similar hospitals$/,
    );
    expect(items[2]!.querySelector("[data-second]")).toBeNull();
    expect(items.some((i) => i.querySelector("[data-second]"))).toBe(true);
    unmount();
    alone(read, "table");
    const table = screen.getByRole("table", {
      name: "Cases per 1,000 by month",
    });
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    const at = heads.indexOf("Median of similar hospitals");
    expect(at).toBeGreaterThan(0);
    const medians = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[at]!.textContent);
    expect(medians[2]).toBe("Not enough similar hospitals");
    expect(medians).not.toContain("Fewer than 5");
    expect(
      within(table).getByRole("row", { name: new RegExp(month) }),
    ).toHaveTextContent("Not enough similar hospitals");
  });

  it("a hidden rate beside a shown count reads Not shown · 25, never Fewer than 5 · 25", async () => {
    const read = await readAll();
    const conds = read.data.data.by_condition;
    conds[0] = {
      ...conds[0]!,
      cases: { value: 25, suppressed: false, drill: null },
      rate: {
        count: { value: 25, suppressed: false },
        base: hidden,
        per_1000: hidden,
      },
    };
    const series = read.data.data.series;
    series[0] = {
      ...series[0]!,
      rate: {
        count: { value: 25, suppressed: false },
        base: hidden,
        per_1000: hidden,
      },
    };
    const name = conds[0]!.condition.name!;
    const { unmount } = alone(read, "chart");
    const bar = within(screen.getByRole("list", { name: "By condition" }))
      .getByText(new RegExp(name))
      .closest("li")!;
    expect(bar.querySelector("b")!.textContent).toBe("Not shown · 25");
    expect(bar.querySelector("[aria-hidden].rounded-full")).toBeNull();
    const [first] = within(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    ).getAllByRole("listitem");
    expect(first!.getAttribute("aria-label")).toMatch(/: Not shown$/);
    expect(document.body.textContent).not.toContain("Fewer than 5 · 25");
    unmount();
    alone(read, "table");
    const row = within(
      screen.getByRole("table", { name: "By condition" }),
    ).getByRole("row", { name: new RegExp(name) });
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells[2]).toBe("25");
    expect(cells[3]).toBe("Not shown");
    const month = within(
      screen.getByRole("table", { name: "Cases per 1,000 by month" }),
    ).getAllByRole("row")[1]!;
    expect(within(month).getAllByRole("cell")[3]!.textContent).toBe(
      "Not shown",
    );
  });

  it("a month from too few hospitals reads the words and draws no column", async () => {
    const read = await readAll();
    const series = read.data.data.series;
    const tooFew = {
      value: null,
      suppressed: true,
      why: "too_few_hospitals" as const,
    };
    series[0] = {
      ...series[0]!,
      rate: { count: tooFew, base: tooFew, per_1000: tooFew },
    };
    alone(read, "chart");
    const [first] = within(
      screen.getByRole("list", { name: "Cases per 1,000 by month" }),
    ).getAllByRole("listitem");
    expect(first!.getAttribute("aria-label")).toMatch(
      /: Too few hospitals to show$/,
    );
    expect(
      first!.querySelector("span[aria-hidden].block")!.getAttribute("style"),
    ).toMatch(/height:\s*0/);
  });
});
