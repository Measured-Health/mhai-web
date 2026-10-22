import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuardedOut } from "@/lib/api/admin-contract";
import type { AnalysisClient } from "@/lib/api/analysis";
import type {
  AffectedOut,
  AnalysisFilters,
  Drillable,
  Meta,
  PrevalenceOut,
  ViewId,
  ViewOut,
} from "@/lib/api/analysis-contract";
import { FILTER_OPTIONS } from "@/lib/api/analysis-fixtures";
import { createMockAnalysis } from "@/lib/api/mock-analysis";
import { hideAllWhenFew } from "@/lib/analysis-queries";
import { analysisCsv } from "@/lib/analysis/csv";
import { defaultFilters, rangeFor } from "@/lib/analysis/filters";
import { conditionText, countText } from "@/lib/analysis/labels";
import { readView } from "@/lib/analysis/read";
import { viewSummary } from "@/lib/analysis/summary";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({
  client: null as unknown as AnalysisClient,
}));
vi.mock("@/lib/api/analysis", () => ({
  getAnalysisClient: () => holder.client,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/analysis",
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@mhai/ui/csv", async (original) => ({
  ...(await original<typeof import("@mhai/ui/csv")>()),
  downloadCsv: download,
}));
import { AnalysisView } from "./analysis-view";

const TODAY = "2026-10-22";
const F90 = defaultFilters(TODAY);
const sample = createMockAnalysis({ delayMs: 0 });

/** What the page should show for a view: the mock's reply, read. */
async function expected<V extends ViewId>(
  v: V,
  f: AnalysisFilters,
): Promise<ViewOut[V]> {
  const s = readView(v, await sample.getView(v, f));
  if (s.status !== "ok") throw new Error(`the mock's ${v} didn't read`);
  return hideAllWhenFew<V>(s.data);
}

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const D = (g: GuardedOut, drill: string | null = null): Drillable => ({
  ...g,
  drill,
});
const meta = (patients: GuardedOut): Meta => ({
  updated_at: "2026-10-22T06:00:00.000Z",
  from: "2026-07-24",
  to: "2026-10-22",
  bucket: "week",
  patients,
});
const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };
const A15 = { id: "a15", name: "Tuberculosis", icd10: "A15" };
const J45 = { id: "j45", name: "Asthma", icd10: "J45" };
const UNMAPPED = { id: "unmapped", name: null, icd10: null };

/** A week hidden between a real 20 and a real 0. */
const WITH_HIDDEN_WEEK: PrevalenceOut = {
  ...meta(S(300)),
  total: { cases: S(120), new: S(30), existing: S(90) },
  by_condition: [
    {
      condition: E11,
      cases: D(S(60), "cond-e11"),
      new: S(10),
      existing: S(50),
    },
  ],
  series: [
    { start: "2026-07-24", cases: S(20), new: S(5) },
    { start: "2026-07-31", cases: H, new: H },
    { start: "2026-08-07", cases: S(0), new: S(0) },
  ],
};

/** One ward, 80 and over, female: a handful of patients. */
const FEW: Pick<ViewOut, "prevalence" | "affected"> = {
  prevalence: {
    ...meta(H),
    total: { cases: H, new: H, existing: S(0) },
    // Sent by size, as a careless server might: the page sorts them by name.
    by_condition: [
      { condition: E11, cases: D(H), new: H, existing: S(0) },
      { condition: UNMAPPED, cases: D(H), new: H, existing: S(0) },
      { condition: A15, cases: D(H), new: H, existing: S(0) },
      { condition: J45, cases: D(H), new: H, existing: S(0) },
    ],
    series: [
      { start: "2026-07-24", cases: H, new: H },
      { start: "2026-07-31", cases: S(0), new: S(0) },
    ],
  },
  affected: {
    ...meta(H),
    by_age: [
      { band: "0-17", patients: D(S(0)) },
      { band: "18-39", patients: D(S(0)) },
      { band: "40-64", patients: D(S(0)) },
      { band: "65-79", patients: D(S(0)) },
      { band: "80+", patients: D(H) },
    ],
    by_sex: [
      { sex: "female", patients: D(H) },
      { sex: "male", patients: D(S(0)) },
      { sex: "other", patients: D(S(0)) },
      { sex: "not_recorded", patients: D(S(0)) },
    ],
    by_setting: [{ setting: "admitted", patients: D(H) }],
    by_location: [
      {
        location: {
          id: "ward7",
          label: "Ward 7 (Paediatrics)",
          setting: "admitted",
        },
        patients: D(H),
      },
    ],
    by_specialty: [{ specialty: "Paediatrics", patients: D(H) }],
  } satisfies AffectedOut,
};

const render = () => renderAdmin(<AnalysisView today={TODAY} />);
const loaded = () => screen.findByRole("list", { name: "Cases by condition" });
const viewRegion = (name: string) => screen.getByRole("region", { name });
const listItems = (list: HTMLElement) => within(list).getAllByRole("listitem");
const bars = (list: HTMLElement) =>
  list.querySelectorAll("li > [aria-hidden] > span");
const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

function phone() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}
function goOffline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}
function goOnline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

beforeEach(() => {
  holder.client = createMockAnalysis({ delayMs: 0 });
  download.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe("AnalysisView", () => {
  it("opens on Prevalence and trends for the last 90 days", async () => {
    const spy = vi.spyOn(holder.client, "getView");
    render();
    expect(
      screen.getByRole("heading", { name: "Analysis", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Havana Hospital").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("tab", { name: "Prevalence and trends" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "Who is affected" }),
    ).toHaveAttribute("aria-selected", "false");
    const period = screen.getByLabelText("Period");
    expect(period).toHaveValue("90d");
    expect(
      within(period).getByRole<HTMLOptionElement>("option", {
        name: "Last 90 days",
      }).selected,
    ).toBe(true);
    await loaded();
    expect(F90).toMatchObject({ from: "2026-07-24", to: TODAY });
    expect(spy).toHaveBeenCalledWith("prevalence", F90);
    expect(spy.mock.calls.every(([v]) => v === "prevalence")).toBe(true);
    expect(screen.getAllByText(/^Updated /).length).toBeGreaterThan(0);
  });

  it("the summary and every bar's number show as text", async () => {
    const d = await expected("prevalence", F90);
    render();
    const list = await loaded();
    expect(screen.getByText(viewSummary("prevalence", d))).toBeVisible();
    const items = listItems(list);
    expect(items).toHaveLength(d.by_condition.length);
    d.by_condition.forEach((r, i) =>
      expect(items[i]).toHaveTextContent(countText(r.cases)),
    );
    const chart = viewRegion("Cases over time");
    const columns = within(chart).getAllByRole("listitem");
    expect(columns).toHaveLength(d.series.length);
    d.series.forEach((p, i) =>
      expect(columns[i]!.getAttribute("aria-label")).toMatch(
        p.cases.suppressed
          ? /: Fewer than 5$/
          : new RegExp(`: ${countText(p.cases)} cases?$`),
      ),
    );

    await userEvent.click(screen.getByRole("tab", { name: "Who is affected" }));
    const a = await expected("affected", F90);
    expect(await screen.findByText(viewSummary("affected", a))).toBeVisible();
    const ages = screen.getByRole("list", { name: "Patients by age band" });
    a.by_age.forEach((r, i) =>
      expect(listItems(ages)[i]).toHaveTextContent(countText(r.patients)),
    );
    for (const name of [
      "Patients by sex",
      "Patients by location type",
      "Patients by ward or clinic",
      "Patients by specialty",
    ])
      expect(screen.getByRole("list", { name })).toBeInTheDocument();
  });

  it("Table shows the same numbers in a table with a caption", async () => {
    const d = await expected("prevalence", F90);
    render();
    await loaded();
    const chartButton = screen.getByRole("button", { name: "Chart" });
    const tableButton = screen.getByRole("button", { name: "Table" });
    expect(chartButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(tableButton);
    expect(tableButton).toHaveAttribute("aria-pressed", "true");
    expect(chartButton).toHaveAttribute("aria-pressed", "false");
    const table = screen.getByRole("table", { name: "Cases by condition" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Condition",
      "ICD-10",
      "Cases",
      "New in this period",
      "Existing",
      "Patient list",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(d.by_condition.length);
    d.by_condition.forEach((r, i) => {
      const cells = within(rows[i]!)
        .getAllByRole("cell")
        .map((c) => c.textContent);
      expect(cells).toEqual([
        r.condition.icd10 ?? "—",
        countText(r.cases),
        countText(r.new),
        countText(r.existing),
        r.cases.drill && !r.cases.suppressed
          ? `See patients · ${conditionText(r.condition)}`
          : "",
      ]);
    });
    expect(
      screen.getByRole("table", { name: "Cases over time" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Cases by condition" }),
    ).toBeNull();
    // One table toggle: the frame's, not a second one inside the chart.
    expect(screen.queryByRole("button", { name: "Show as table" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.queryByRole("button", { name: "Show as table" })).toBeNull();
  });

  it("a hidden week reads Fewer than 5, with no column, beside a real 0", async () => {
    vi.spyOn(holder.client, "getView").mockResolvedValue(WITH_HIDDEN_WEEK);
    render();
    await loaded();
    const chart = viewRegion("Cases over time");
    const columns = within(chart).getAllByRole("listitem");
    expect(columns.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Week of 24 Jul: 20 cases",
      "Week of 31 Jul: Fewer than 5",
      "Week of 7 Aug: 0 cases",
    ]);
    const height = (li: HTMLElement) =>
      li.querySelector<HTMLElement>("span[aria-hidden].block")!.style.height;
    // The hidden week is out of the scale: the 20 fills it.
    expect(height(columns[0]!)).toBe("100%");
    expect(height(columns[1]!)).toMatch(/^0(px)?$/);
    expect(chart.textContent).not.toMatch(/31 Jul: 0/);

    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", { name: "Cases over time" });
    const hidden = within(table).getByRole("row", { name: /Week of 31 Jul/ });
    expect(within(hidden).getAllByText("Fewer than 5")).toHaveLength(2);
    expect(hidden.textContent).not.toMatch(/\b0\b/);
    const zero = within(table).getByRole("row", { name: /Week of 7 Aug/ });
    expect(
      within(zero)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["0", "0"]);
  });

  it("filtering to Ward 7, 80 and over, female shows Fewer than 5 everywhere, with no bars", async () => {
    const real = holder.client;
    const few = (f: AnalysisFilters) =>
      f.location === "ward7" && f.age_band === "80+" && f.sex === "female";
    holder.client = {
      ...real,
      getView: (async (v: ViewId, f: AnalysisFilters) =>
        few(f) && (v === "prevalence" || v === "affected")
          ? structuredClone(FEW[v])
          : real.getView(v, f)) as AnalysisClient["getView"],
    };
    render();
    await loaded();
    await waitFor(() =>
      expect(screen.getByLabelText("Age band")).toBeEnabled(),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Ward or clinic"),
      "ward7",
    );
    await userEvent.selectOptions(screen.getByLabelText("Age band"), "80+");
    await userEvent.selectOptions(screen.getByLabelText("Sex"), "female");

    const summary = "Fewer than 5 patients match these filters";
    expect(await screen.findByText(summary)).toBeVisible();
    const list = screen.getByRole("list", { name: "Cases by condition" });
    for (const li of listItems(list))
      expect(li).toHaveTextContent(/Fewer than 5$/);
    expect(bars(list)).toHaveLength(0);
    // All hidden: by name, never by size; Not standardised last.
    expect(listItems(list).map((li) => li.textContent)).toEqual([
      "Asthma · J45Fewer than 5",
      "Tuberculosis · A15Fewer than 5",
      "Type 2 diabetes · E11Fewer than 5",
      "Not standardisedFewer than 5",
    ]);
    // The prevalence file: no bare number, the zeros masked too, same order.
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    const prevCsv = download.mock.calls[0]![1] as string;
    const totals = prevCsv.slice(prevCsv.indexOf("Totals"));
    expect(totals).toContain("Fewer than 5");
    expect(totals).not.toMatch(/(^|,)\d+(,|\r\n)/m);
    expect(totals.indexOf("Asthma")).toBeLessThan(
      totals.indexOf("Tuberculosis"),
    );
    expect(totals.indexOf("Type 2 diabetes")).toBeLessThan(
      totals.indexOf("Not standardised"),
    );
    const columns = within(viewRegion("Cases over time")).getAllByRole(
      "listitem",
    );
    for (const c of columns)
      expect(c.getAttribute("aria-label")).toMatch(/: Fewer than 5$/);

    await userEvent.click(screen.getByRole("tab", { name: "Who is affected" }));
    expect(await screen.findByText(summary)).toBeVisible();
    const panel = screen.getByRole("tabpanel");
    for (const name of [
      "Patients by age band",
      "Patients by sex",
      "Patients by location type",
      "Patients by ward or clinic",
      "Patients by specialty",
    ]) {
      const l = within(panel).getByRole("list", { name });
      for (const li of listItems(l))
        expect(li).toHaveTextContent(/Fewer than 5$/);
      expect(bars(l)).toHaveLength(0);
      // Not even a 0 beside a hidden group.
      for (const n of l.querySelectorAll("b"))
        expect(n.textContent).toBe("Fewer than 5");
    }

    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    const csv = download.mock.calls[1]![1] as string;
    const body = csv.slice(csv.indexOf("By age band"));
    expect(body).toContain("Fewer than 5");
    expect(body).not.toMatch(/,\d+\r\n/);
  });

  it("searching E11 picks Type 2 diabetes and reloads the views", async () => {
    const spy = vi.spyOn(holder.client, "getView");
    render();
    await loaded();
    const combo = screen.getByRole("combobox", { name: "Condition" });
    await waitFor(() => expect(combo).toBeEnabled());
    await userEvent.type(combo, "E11");
    expect(combo).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Conditions" });
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Type 2 diabetes · E11"]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(combo).toHaveValue("Type 2 diabetes · E11");
    expect(combo).toHaveAttribute("aria-expanded", "false");
    const withE11 = { ...F90, condition: "e11" };
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("prevalence", withE11),
    );
    const d = await expected("prevalence", withE11);
    expect(await screen.findByText(viewSummary("prevalence", d))).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Who is affected" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("affected", withE11));
  });

  it("Source shows with two sources and lists their labels only", async () => {
    const { unmount } = render();
    const source = await screen.findByLabelText("Source");
    expect(optionNames(source)).toEqual([
      "All sources",
      "Main record",
      "Results system",
    ]);
    expect(
      within(source)
        .getAllByRole<HTMLOptionElement>("option")
        .map((o) => o.value),
    ).toEqual(["", "main_record", "results_system"]);
    unmount();

    vi.spyOn(holder.client, "getFilterOptions").mockResolvedValue({
      ...structuredClone(FILTER_OPTIONS),
      sources: [{ id: "main_record", label: "Main record" }],
    });
    render();
    await waitFor(() =>
      expect(screen.getByLabelText("Age band")).toBeEnabled(),
    );
    expect(screen.queryByLabelText("Source")).toBeNull();
    expect(screen.queryByText("All sources")).toBeNull();
  });

  it("Not standardised is listed as a condition", async () => {
    const d = await expected("prevalence", F90);
    expect(d.by_condition.some((r) => r.condition.name === null)).toBe(true);
    render();
    const list = await loaded();
    expect(within(list).getByText("Not standardised")).toBeInTheDocument();
    const combo = screen.getByRole("combobox", { name: "Condition" });
    await waitFor(() => expect(combo).toBeEnabled());
    await userEvent.type(combo, "not");
    expect(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "Not standardised",
      }),
    ).toBeInTheDocument();
  });

  it("a failing view shows Couldn't load prevalence and trends with Try again, and no zeros", async () => {
    // A shown 3: the server should have hidden it, so the view fails closed.
    const leaky = structuredClone(WITH_HIDDEN_WEEK);
    leaky.series[1]!.cases = S(3);
    const spy = vi.spyOn(holder.client, "getView").mockResolvedValue(leaky);
    render();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load prevalence and trends");
    const region = viewRegion("Prevalence and trends");
    expect(region.textContent).not.toMatch(/\d/);
    expect(within(region).queryByRole("list")).toBeNull();
    expect(within(region).queryByRole("button", { name: "Table" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeDisabled();

    spy.mockRestore();
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );
    await loaded();
    expect(
      screen.queryByText("Couldn't load prevalence and trends"),
    ).toBeNull();
  });

  it("the filters failing keep the period working", async () => {
    vi.spyOn(holder.client, "getFilterOptions").mockResolvedValue({} as never);
    const spy = vi.spyOn(holder.client, "getView");
    render();
    const reason = await screen.findByText("Couldn't load the filters");
    for (const label of [
      "Age band",
      "Sex",
      "Ward or clinic",
      "Location type",
      "Specialty",
    ]) {
      const c = screen.getByLabelText(label);
      expect(c).toBeDisabled();
      expect(c).toHaveAttribute("aria-describedby", reason.closest("p")!.id);
    }
    expect(screen.getByRole("combobox", { name: "Condition" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    const period = screen.getByLabelText("Period");
    expect(period).toBeEnabled();
    await userEvent.selectOptions(period, "30d");
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("prevalence", {
        ...F90,
        ...rangeFor("30d", TODAY),
      }),
    );
    await loaded();
  });

  it("Download CSV builds the file for the active view and filters", async () => {
    render();
    await loaded();
    await userEvent.click(screen.getByRole("tab", { name: "Who is affected" }));
    await waitFor(() => expect(screen.getByLabelText("Sex")).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText("Sex"), "female");
    const f = { ...F90, sex: "female" as const };
    const d = await expected("affected", f);
    await screen.findByText(viewSummary("affected", d));
    const button = screen.getByRole("button", { name: "Download CSV" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(
      "mhai-analysis-affected-2026-07-24-to-2026-10-22.csv",
      analysisCsv("affected", d, {
        hospital: "Havana Hospital",
        filters: f,
        options: FILTER_OPTIONS,
      }),
    );
    const csv = download.mock.calls[0]![1] as string;
    expect(csv).toContain("Analysis,Who is affected");
    expect(csv).toContain("Sex,Female");
    expect(csv).not.toMatch(/P-[A-Z0-9]{4,}|drill|age-|sex-female/);
  });

  it("offline disables the filters with the reason and keeps Download CSV", async () => {
    const d = await expected("prevalence", F90);
    render();
    await loaded();
    await waitFor(() =>
      expect(screen.getByLabelText("Age band")).toBeEnabled(),
    );
    goOffline();
    try {
      const reason = screen.getByText(
        "You're offline. Reconnect to change the filters.",
      );
      const id = reason.closest("p")!.id;
      for (const label of ["Period", "Age band", "Sex", "Source"]) {
        const c = screen.getByLabelText(label);
        expect(c).toBeDisabled();
        expect(c).toHaveAttribute("aria-describedby", id);
      }
      expect(
        screen.getByRole("combobox", { name: "Condition" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Clear filters" }),
      ).toBeDisabled();
      expect(screen.getByText(viewSummary("prevalence", d))).toBeVisible();
      const button = screen.getByRole("button", { name: "Download CSV" });
      expect(button).toBeEnabled();
      await userEvent.click(button);
      expect(download).toHaveBeenCalledTimes(1);
    } finally {
      goOnline();
    }
  });

  it("nothing goes in the URL or storage", async () => {
    const href = window.location.href;
    const title = document.title;
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((k) =>
      vi.spyOn(console, k),
    );
    render();
    await loaded();
    await waitFor(() =>
      expect(screen.getByLabelText("Age band")).toBeEnabled(),
    );
    await userEvent.selectOptions(screen.getByLabelText("Age band"), "65-79");
    await userEvent.selectOptions(screen.getByLabelText("Period"), "12m");
    await userEvent.click(screen.getByRole("tab", { name: "Who is affected" }));
    await screen.findByRole("list", { name: "Patients by age band" });
    expect(window.location.href).toBe(href);
    expect(document.title).toBe(title);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    // Nor in the logs: no filter value is ever written out.
    for (const spy of logs)
      for (const args of spy.mock.calls)
        expect(JSON.stringify(args)).not.toMatch(/65-79|2025-10-22|"12m"/);
  });

  it("at phone width the filters open in a sheet and the views are a select", async () => {
    phone();
    render();
    expect(screen.queryByRole("tablist")).toBeNull();
    const views = screen.getByLabelText("View");
    expect(optionNames(views)).toEqual([
      "Prevalence and trends",
      "Who is affected",
      "Co-occurring conditions",
      "Findings and alerts",
      "MHAI quality",
    ]);
    expect(screen.queryByLabelText("Age band")).toBeNull();
    await loaded();
    await userEvent.click(screen.getByRole("button", { name: "Filters (0)" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    const age = within(sheet).getByLabelText("Age band");
    await waitFor(() => expect(age).toBeEnabled());
    await userEvent.selectOptions(age, "40-64");
    await userEvent.click(
      within(sheet).getAllByRole("button", { name: "Close" })[0]!,
    );
    expect(
      screen.getByRole("button", { name: "Filters (1)" }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(views, "affected");
    await screen.findByRole("list", { name: "Patients by age band" });
    // Tables become cards.
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.queryByRole("table")).toBeNull();
    const cards = screen.getByRole("list", { name: "Patients by sex" });
    expect(within(cards).getAllByRole("listitem")[0]).toHaveTextContent(
      /^Female/,
    );
  });
});
