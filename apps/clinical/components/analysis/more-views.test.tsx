import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuardedOut } from "@/lib/api/admin-contract";
import type { AnalysisClient } from "@/lib/api/analysis";
import type {
  AnalysisFilters,
  CoOccurringOut,
  Drillable,
  FindingsOut,
  Meta,
  QualityOut,
  ViewId,
  ViewOut,
} from "@/lib/api/analysis-contract";
import { createMockAnalysis } from "@/lib/api/mock-analysis";
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
import { AnalysisView } from "./analysis-view";

const TODAY = "2026-10-22";
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
const I10 = { id: "i10", name: "Hypertension", icd10: "I10" };
const J45 = { id: "j45", name: "Asthma", icd10: "J45" };

const CO: CoOccurringOut = {
  ...meta(S(300)),
  pairs: [
    {
      a: E11,
      b: I10,
      a_patients: S(100),
      patients: D(S(40), "pair-1"),
      share_of_a: S(0.4),
    },
    {
      a: J45,
      b: E11,
      a_patients: S(60),
      patients: D(H),
      share_of_a: H,
    },
  ],
};
const FIND: FindingsOut = {
  ...meta(S(300)),
  findings: [
    {
      name: "Potassium",
      flag: "low",
      patients: D(S(30), "f1"),
      results: S(50),
    },
    {
      name: "Creatinine",
      flag: "high",
      patients: D(S(20), "f2"),
      results: S(25),
    },
    { name: "ECG", flag: "abnormal", patients: D(H), results: H },
    { name: null, flag: null, patients: D(S(12), "f4"), results: S(14) },
  ],
  alerts: {
    total: S(60),
    by_severity: { critical: S(10), urgent: S(20), info: S(30) },
    median_ack_minutes: { value: 12.5, suppressed: false },
    critical_median_ack_minutes: S(6),
    dismissed: S(15),
    dismiss_reasons: [
      { reason: "not_relevant", count: S(10) },
      { reason: "already_known", count: S(5) },
    ],
  },
};
const QUAL: QualityOut = {
  ...meta(S(300)),
  by_condition: [
    {
      condition: E11,
      consultations: S(100),
      confidence: { high: S(60), caution: S(20), review: S(15), failed: S(5) },
      agreement_rate: S(0.8),
      rated: S(50),
      corrections: {
        total: S(30),
        approved: S(10),
        rejected: S(10),
        waiting: S(10),
      },
    },
  ],
};
const SAMPLES: Partial<ViewOut> = {
  "co-occurring": CO,
  findings: FIND,
  quality: QUAL,
};

/** The mock for everything, with these replies for the three views. */
function serve(over: Partial<Record<ViewId, unknown>>) {
  const real = createMockAnalysis({ delayMs: 0 });
  holder.client = {
    ...real,
    getView: (async (v: ViewId, f: AnalysisFilters) =>
      v in over
        ? structuredClone(over[v])
        : real.getView(v, f)) as AnalysisClient["getView"],
  };
}
const open = async (title: string) => {
  renderAdmin(<AnalysisView today={TODAY} />);
  await userEvent.click(screen.getByRole("tab", { name: title }));
};

beforeEach(() => serve(SAMPLES));
afterEach(() => vi.restoreAllMocks());

describe("Co-occurring conditions", () => {
  it("lists pairs with the share of the first condition", async () => {
    await open("Co-occurring conditions");
    const list = await screen.findByRole("list", { name: "Patients by pair" });
    const [first] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Type 2 diabetes + Hypertension");
    expect(first).toHaveTextContent("40");
    expect(first).toHaveTextContent("40% of people with Type 2 diabetes");
  });

  it("a hidden share reads Fewer than 5", async () => {
    await open("Co-occurring conditions");
    const list = await screen.findByRole("list", { name: "Patients by pair" });
    const second = within(list).getAllByRole("listitem")[1]!;
    expect(second).toHaveTextContent("Asthma + Type 2 diabetesFewer than 5");
    expect(second.textContent).not.toMatch(/of people with/);
    expect(second.querySelectorAll("[aria-hidden] > span")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    const row = screen.getByRole("row", { name: /Asthma/ });
    expect(within(row).getAllByText("Fewer than 5")).toHaveLength(2);
  });

  it("has a table view with the same numbers", async () => {
    await open("Co-occurring conditions");
    await screen.findByRole("list", { name: "Patients by pair" });
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", {
      name: "Conditions found together",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Condition A",
      "Condition B",
      "Patients",
      "Share of condition A",
    ]);
    const row = within(table).getAllByRole("row")[1]!;
    expect(
      [
        within(row).getByRole("rowheader"),
        ...within(row).getAllByRole("cell"),
      ].map((c) => c.textContent),
    ).toEqual(["Type 2 diabetes · E11", "Hypertension · I10", "40", "40%"]);
  });
});

describe("Findings and alerts", () => {
  it("shows flag words with icons, never colour alone", async () => {
    await open("Findings and alerts");
    const list = await screen.findByRole("list", {
      name: "Patients by finding",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Potassium · Low30");
    expect(items[1]).toHaveTextContent("Creatinine · High20");
    expect(items[2]).toHaveTextContent("Not standardised12");
    // Hidden rows come after the shown ones.
    expect(items[3]).toHaveTextContent("ECG · AbnormalFewer than 5");
    for (const li of [items[0]!, items[1]!, items[3]!])
      expect(li.querySelector("svg[aria-hidden]")).not.toBeNull();
  });

  it("shows alerts by severity and the Critical median", async () => {
    await open("Findings and alerts");
    const sev = await screen.findByRole("list", { name: "Alerts by severity" });
    const items = within(sev).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Critical10",
      "Urgent20",
      "Info30",
    ]);
    for (const li of items)
      expect(li.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(
      screen.getByText("Median, Critical alerts").nextSibling,
    ).toHaveTextContent("6 min");
    expect(
      screen.getByText("Median, all alerts").nextSibling,
    ).toHaveTextContent("12.5 min");
    expect(
      within(
        screen.getByRole("list", { name: "Dismissed alerts by reason" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(2);
  });

  it("has a table for each, with the same numbers", async () => {
    await open("Findings and alerts");
    await screen.findByRole("list", { name: "Patients by finding" });
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    for (const name of [
      "Findings",
      "Alerts by severity",
      "Time to acknowledge",
      "Why alerts were dismissed",
    ])
      expect(screen.getByRole("table", { name })).toBeInTheDocument();
    const med = screen.getByRole("table", { name: "Time to acknowledge" });
    expect(
      within(med).getByRole("row", { name: /Critical/ }),
    ).toHaveTextContent("6 min");
    const rows = within(
      screen.getByRole("table", { name: "Findings" }),
    ).getAllByRole("row");
    expect(rows[4]).toHaveTextContent("ECGAbnormalFewer than 5Fewer than 5");
  });
});

describe("MHAI quality", () => {
  it("shows the confidence mix, agreement and correction outcomes per condition", async () => {
    await open("MHAI quality");
    const mix = await screen.findByRole("list", {
      name: "Confidence, Type 2 diabetes · E11",
    });
    expect(
      within(mix)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "High confidence60",
      "Use with caution20",
      "Needs review15",
      "Couldn't complete5",
    ]);
    expect(screen.getByText("Clinicians agreed 80% of 50 rated")).toBeVisible();
    const fixes = screen.getByRole("list", {
      name: "Corrections, Type 2 diabetes · E11",
    });
    expect(
      within(fixes)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Approved10", "Rejected10", "Waiting10"]);
    for (const li of within(fixes).getAllByRole("listitem"))
      expect(li.querySelector("svg[aria-hidden]")).not.toBeNull();
  });

  it("has a table view with the same numbers", async () => {
    await open("MHAI quality");
    await screen.findByText("Clinicians agreed 80% of 50 rated");
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
    const row = within(
      screen.getByRole("table", { name: "MHAI quality by condition" }),
    ).getAllByRole("row")[1]!;
    expect(
      [
        within(row).getByRole("rowheader"),
        ...within(row).getAllByRole("cell"),
      ].map((c) => c.textContent),
    ).toEqual([
      "Type 2 diabetes · E11",
      "100",
      "60",
      "20",
      "15",
      "5",
      "50",
      "80%",
      "10",
      "10",
      "10",
    ]);
  });
});

describe("the three views", () => {
  it("each fails alone and the others keep working", async () => {
    const real = createMockAnalysis({ delayMs: 0 });
    holder.client = {
      ...real,
      getView: (async (v: ViewId, f: AnalysisFilters) => {
        if (v === "findings") throw new Error("down");
        return v in SAMPLES ? structuredClone(SAMPLES[v]) : real.getView(v, f);
      }) as AnalysisClient["getView"],
    };
    await open("Findings and alerts");
    expect(
      await screen.findByText(
        "Couldn't load findings and alerts",
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "MHAI quality" }));
    expect(
      await screen.findByText("Clinicians agreed 80% of 50 rated"),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("tab", { name: "Co-occurring conditions" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Patients by pair" }),
      ).toBeVisible(),
    );
  }, 15000);
});
