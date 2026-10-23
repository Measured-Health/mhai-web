import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsOut } from "@/lib/api/analytics-contract";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { valueText } from "@/lib/analytics/measures";
import { ADA, renderWithAuth } from "@/tests/render";
import { AnalyticsView } from "./analytics-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/usage",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let api: PlatformClient;
beforeEach(() => {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const UPDATED = /^Updated \d{2}:\d{2}$/;
const tab = (name: string) => screen.getByRole("tab", { name });
async function open(changes = true) {
  renderWithAuth(<AnalyticsView />, { user: ADA });
  // Without the alerts area the Critical guard fails What changed closed.
  if (changes) await screen.findByRole("list", { name: "Changes" });
  await screen.findByRole("list", {
    name: "Questions per active clinician, by hospital",
  });
}
async function go(name: string) {
  await userEvent.click(tab(name));
  return screen.getByRole("tabpanel");
}
const card = (name: string) => {
  const li = screen
    .getAllByRole("listitem")
    .find((x) => x.getAttribute("aria-label") === name);
  if (!li) throw new Error(`no card ${name}`);
  return within(li);
};
const pair = (c: ReturnType<typeof within>, label: string) =>
  c.getByText(label).closest("div")!.querySelector("dd")!.textContent;

describe("the analytics tabs", () => {
  it("opens on Use, with arrow keys moving between tabs", async () => {
    await open();
    expect(tab("Use")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    tab("Use").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Alert safety")).toHaveAttribute("aria-selected", "true");
    expect(tab("Alert safety")).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(tab("Hospitals")).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Use")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Use");
  });

  it("each tab shows its per-hospital numbers and the median", async () => {
    await open();
    const a = await api.getAnalytics("30d");
    if ("unavailable" in a.use || "unavailable" in a.alerts) throw new Error();
    if ("unavailable" in a.quality) throw new Error();

    // Use
    const nth = a.use.rows.find((r) => r.hospital.id === "h_northgate")!;
    const bars = screen.getByRole("list", {
      name: "Questions per active clinician, by hospital",
    });
    expect(
      within(bars).getByText(valueText(nth.questions_per_clinician, "rate")),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Median of all hospitals:/).textContent).toContain(
      valueText(a.use.median.questions_per_clinician, "rate"),
    );
    expect(
      within(screen.getByRole("tabpanel")).getByText(UPDATED),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Questions across all hospitals" }),
    ).toBeInTheDocument();

    // Alert safety
    await go("Alert safety");
    const ar = a.alerts.rows.find((r) => r.hospital.id === "h_northgate")!;
    const n = card("Northgate General Hospital");
    expect(pair(n, "Critical median time to acknowledge")).toBe(
      valueText(ar.critical_median_ack_minutes, "minutes"),
    );
    expect(pair(n, "Median time to acknowledge")).toBe(
      valueText(ar.median_ack_minutes, "minutes"),
    );
    expect(pair(n, "Critical within target")).toBe(
      valueText(ar.critical_within_target, "share"),
    );
    expect(pair(n, "Unhandled")).toBe(valueText(ar.unhandled, "count"));
    expect(pair(n, "Urgent")).toBe(valueText(ar.by_severity.urgent, "count"));
    expect(pair(card("Median of all hospitals"), "Unhandled")).toBe(
      valueText(a.alerts.median.unhandled, "count"),
    );
    expect(
      within(screen.getByRole("tabpanel")).getByText(UPDATED),
    ).toBeInTheDocument();

    // Answer quality
    await go("Answer quality");
    const qr = a.quality.rows.find((r) => r.hospital.id === "h_northgate")!;
    const q = card("Northgate General Hospital");
    expect(pair(q, "Answers needing review")).toBe(
      valueText(qr.needs_review_share, "share"),
    );
    expect(pair(q, "High confidence")).toBe(
      valueText(qr.confidence.high, "count"),
    );
    expect(pair(q, "Low confidence")).toBe(
      valueText(qr.confidence.low, "count"),
    );
    expect(pair(q, "Agreement on reviews")).toBe(
      valueText(qr.agreement_rate, "share"),
    );
    expect(pair(q, "Median review time")).toBe(
      valueText(qr.median_review_hours, "hours"),
    );
    expect(pair(card("Median of all hospitals"), "Median review time")).toBe(
      valueText(a.quality.median.median_review_hours, "hours"),
    );
    expect(
      within(screen.getByRole("tabpanel")).getByText(UPDATED),
    ).toBeInTheDocument();
  });

  it("Alert safety shows each hospital's target", async () => {
    await open();
    const a = await api.getAnalytics("30d");
    if ("unavailable" in a.alerts) throw new Error();
    await go("Alert safety");
    for (const r of a.alerts.rows)
      expect(
        card(r.hospital.name).getByText(
          `Target ${r.critical_target_minutes} min`,
        ),
      ).toBeInTheDocument();
  });

  it("hidden values read Fewer than 5 with no bar", async () => {
    await open();
    const bars = screen.getByRole("list", {
      name: "Questions per active clinician, by hospital",
    });
    const lake = within(bars)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("Lakeside"))!;
    expect(within(lake).getByText("Fewer than 5")).toBeInTheDocument();
    expect(lake.querySelector(".bg-lilac")).toBeNull();
    // A zero is a zero, not hidden.
    const hill = within(bars)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("Hilltop"))!;
    expect(hill.textContent).toContain("0 questions");
    expect(hill.textContent).not.toContain("Fewer than 5");
    // Alert safety, too.
    await go("Alert safety");
    expect(pair(card("Lakeside Community Clinic"), "Unhandled")).toBe(
      "Fewer than 5",
    );
    expect(pair(card("Hilltop Cottage Hospital"), "Unhandled")).toBe("0");
  });

  it("a hidden trend point is marked and draws no column value", async () => {
    const real = api.getAnalytics.bind(api);
    vi.spyOn(api, "getAnalytics").mockImplementation(async (p) => {
      const a = structuredClone(await real(p)) as AnalyticsOut;
      if (!("unavailable" in a.use))
        a.use.trend[1] = {
          ...a.use.trend[1]!,
          value: { value: null, suppressed: true },
        };
      return a;
    });
    await open();
    const chart = screen.getByRole("region", {
      name: "Questions across all hospitals",
    });
    expect(
      within(chart).getByRole("button", { name: "Show as table" }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(chart).getByRole("button", { name: "Show as table" }),
    );
    const row = within(chart)
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Fewer than 5"))!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["Fewer than 5"]);
    await userEvent.click(
      within(chart).getByRole("button", { name: "Show as chart" }),
    );
    const hiddenCol = within(chart)
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-label")?.includes("Fewer than 5"))!;
    expect(hiddenCol.getAttribute("aria-label")).not.toMatch(/\b0\b/);
  });

  it("a tab's area failing shows its Couldn't load and leaves other tabs working", async () => {
    const real = api.getAnalytics.bind(api);
    vi.spyOn(api, "getAnalytics").mockImplementation(async (p) => ({
      ...(await real(p)),
      alerts: { unavailable: true },
    }));
    await open(false);
    await go("Alert safety");
    expect(screen.getByText("Couldn't load alert safety.")).toBeInTheDocument();
    expect(
      within(screen.getByRole("tabpanel")).getByRole("button", {
        name: "Try again",
      }),
    ).toBeEnabled();
    expect(
      within(screen.getByRole("tabpanel")).queryByText(/^Updated /),
    ).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    // The others still work.
    await go("Answer quality");
    expect(
      within(screen.getByRole("tabpanel")).getByText(UPDATED),
    ).toBeInTheDocument();
    expect(card("Median of all hospitals")).toBeTruthy();
    await go("Use");
    expect(screen.getByText(/^Median of all hospitals:/)).toBeInTheDocument();
  });

  it("Hospitals sorts by a column and sets aria-sort", async () => {
    await open();
    await go("Hospitals");
    const table = screen.getByRole("table");
    const names = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("button")[0]!.textContent);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent?.replace(/[▲▼]/g, "")),
    ).toEqual([
      "Hospital",
      "Staff",
      "Questions",
      "Questions per clinician",
      "Critical median",
      "Critical within target",
      "Needs review",
    ]);
    const staff = within(table).getByRole("columnheader", { name: /^Staff/ });
    expect(staff).not.toHaveAttribute("aria-sort");
    await userEvent.click(within(staff).getByRole("button"));
    expect(staff).toHaveAttribute("aria-sort", "ascending");
    expect(names()[0]).toBe("Hilltop Cottage Hospital");
    expect(names().at(-1)).toBe("Northgate General Hospital");
    await userEvent.click(within(staff).getByRole("button"));
    expect(staff).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toBe("Northgate General Hospital");
    // Only one column carries aria-sort.
    await userEvent.click(
      within(table).getByRole("button", { name: /^Hospital/ }),
    );
    expect(staff).not.toHaveAttribute("aria-sort");
    expect(
      within(table).getByRole("columnheader", { name: /^Hospital/ }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(
      within(screen.getByRole("tabpanel")).getByText(UPDATED),
    ).toBeInTheDocument();
  });

  it("picking a hospital with no change shows the questions-per-clinician comparison", async () => {
    await open();
    await go("Hospitals");
    await userEvent.click(
      screen.getByRole("button", { name: "Riverside Children's Hospital" }),
    );
    expect(
      await screen.findByRole("region", {
        name: "Questions per active clinician: Riverside Children's Hospital",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Measure" })).toHaveValue(
      "questions_per_clinician",
    );
    // The selected change gave way to the hospital.
    expect(
      within(screen.getByRole("list", { name: "Changes" })).queryByRole(
        "button",
        { current: true },
      ),
    ).toBeNull();
    expect(
      screen.getByText(/^96 staff · .* questions this period$/),
    ).toBeInTheDocument();
  });

  it("a hospital with a change opens on that change's measure, and the select changes the comparison", async () => {
    await open();
    await go("Hospitals");
    await userEvent.click(
      screen.getByRole("button", { name: "Northgate General Hospital" }),
    );
    const select = screen.getByRole("combobox", { name: "Measure" });
    expect(select).toHaveValue("critical_median_ack_minutes");
    expect(
      await screen.findByRole("region", {
        name: "Critical median time to acknowledge: Northgate General Hospital",
      }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(select, "Answers needing review");
    expect(select).toHaveValue("needs_review_share");
    expect(
      await screen.findByRole("region", {
        name: "Answers needing review: Northgate General Hospital",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: /^Critical median time to acknowledge: /,
        }),
      ).toBeNull(),
    );
  });

  it("sorting a column with hidden values puts them last, either way", async () => {
    await open();
    await go("Hospitals");
    const table = screen.getByRole("table");
    const names = () =>
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("button")[0]!.textContent);
    const head = within(table).getByRole("columnheader", {
      name: /^Questions per clinician/,
    });
    await userEvent.click(within(head).getByRole("button"));
    expect(names().slice(-2)).toContain("Lakeside Community Clinic");
    await userEvent.click(within(head).getByRole("button"));
    expect(head).toHaveAttribute("aria-sort", "descending");
    expect(names().slice(-2)).toContain("Lakeside Community Clinic");
  });

  it("a failed area leaves its Hospitals cells Couldn't load while the others render", async () => {
    const real = api.getAnalytics.bind(api);
    vi.spyOn(api, "getAnalytics").mockImplementation(async (p) => ({
      ...(await real(p)),
      alerts: { unavailable: true },
    }));
    await open(false);
    await go("Hospitals");
    const row = within(screen.getByRole("table"))
      .getAllByRole("row")
      .find((r) => within(r).queryByText("Northgate General Hospital"))!;
    const cells = within(row).getAllByRole("cell");
    // Staff, Questions, Per clinician, Critical median, Critical within, Needs review
    expect(cells.map((c) => c.textContent)).toEqual([
      "214",
      expect.stringMatching(/^[\d,]+$|^Fewer than 5$/),
      expect.stringMatching(/^[\d.]+$/),
      "Couldn't load",
      "Couldn't load",
      expect.stringMatching(/^\d+%$/),
    ]);
  });

  it("only the selected tab points at the panel", async () => {
    await open();
    const panel = screen.getByRole("tabpanel");
    for (const t of screen.getAllByRole("tab")) {
      if (t.getAttribute("aria-selected") === "true")
        expect(t).toHaveAttribute("aria-controls", panel.id);
      else expect(t).not.toHaveAttribute("aria-controls");
    }
  });

  it("a malformed hospital chart reply shows Couldn't load the chart", async () => {
    vi.spyOn(api, "getHospitalSeries").mockResolvedValue({
      measure: "questions_per_clinician",
      hospital: { id: "h_riverside", name: "Riverside Children's Hospital" },
    } as unknown as Awaited<ReturnType<PlatformClient["getHospitalSeries"]>>);
    await open();
    await go("Hospitals");
    await userEvent.click(
      screen.getByRole("button", { name: "Riverside Children's Hospital" }),
    );
    expect(
      await screen.findByText("Couldn't load the chart."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.getByText(/ staff · ([\d,]+|Fewer than 5) questions this period$/),
    ).toBeInTheDocument();
  });

  it("at phone width Back from a hospital returns focus to its row", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    await open();
    await go("Hospitals");
    const row = screen.getByRole("button", {
      name: "Riverside Children's Hospital",
    });
    await userEvent.click(row);
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: /Riverside Children's Hospital compared/,
    });
    expect(heading).toHaveFocus();
    expect(screen.queryByRole("tab")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(tab("Hospitals")).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("button", { name: "Riverside Children's Hospital" }),
    ).toHaveFocus();
    vi.unstubAllGlobals();
  });
});
