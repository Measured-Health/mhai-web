import { describe, expect, it } from "vitest";
import { CSV_MAX_ROWS } from "@mhai/ui/csv";
import type { GuardedOut } from "../api/admin-contract";
import type {
  AffectedOut,
  AnalysisFilters,
  Drillable,
  PrevalenceOut,
  ViewId,
} from "../api/analysis-contract";
import { FILTER_OPTIONS } from "../api/analysis-fixtures";
import { createMockAnalysis } from "../api/mock-analysis";
import { analysisCsv, csvFilename } from "./csv";
import { defaultFilters } from "./filters";

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const D = (g: GuardedOut, drill: string | null = null): Drillable => ({
  ...g,
  drill,
});
const F: AnalysisFilters = defaultFilters("2026-10-22");
const ctx = (filters: AnalysisFilters = F) => ({
  hospital: "Demo General Hospital",
  filters,
  options: FILTER_OPTIONS,
});
const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");
const VIEWS: ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
const meta = (patients: GuardedOut) => ({
  updated_at: "2026-10-22T06:00:00.000Z",
  from: F.from,
  to: F.to,
  bucket: "week" as const,
  patients,
});

const prevalence: PrevalenceOut = {
  ...meta(S(300)),
  total: { cases: S(120), new: S(30), existing: S(90) },
  by_condition: [
    {
      condition: { id: "e11", name: "Type 2 diabetes", icd10: "E11" },
      cases: D(S(100), "cond-e11"),
      new: S(25),
      existing: S(75),
    },
    {
      condition: { id: "unmapped", name: null, icd10: null },
      cases: D(S(20), "cond-unmapped"),
      new: S(5),
      existing: S(15),
    },
  ],
  series: [
    { start: "2026-07-24", cases: S(20), new: S(5) },
    { start: "2026-07-31", cases: H, new: H },
  ],
};

const hiddenAffected: AffectedOut = {
  ...meta(H),
  by_age: [
    { band: "0-17", patients: D(S(0)) },
    { band: "80+", patients: D(H) },
  ],
  by_sex: [{ sex: "female", patients: D(H) }],
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
};

describe("analysisCsv", () => {
  it("starts with the view, the hospital and the period", () => {
    const l = lines(analysisCsv("prevalence", prevalence, ctx()));
    expect(l[0]).toBe("Analysis,Prevalence and trends");
    expect(l).toContain("Hospital,Demo General Hospital");
    expect(l).toContain("Period,2026-07-24 to 2026-10-22");
  });

  it("filters are listed by label", () => {
    const csv = analysisCsv(
      "prevalence",
      prevalence,
      ctx({
        ...F,
        condition: "e11",
        age_band: "80+",
        sex: "female",
        location: "ward7",
        setting: "admitted",
        specialty: "Paediatrics",
      }),
    );
    const l = lines(csv);
    expect(l).toContain("Condition,Type 2 diabetes · E11");
    expect(l).toContain("Age band,80 and over");
    expect(l).toContain("Sex,Female");
    expect(l).toContain("Ward or clinic,Ward 7 (Paediatrics)");
    expect(l).toContain("Location type,Admitted");
    expect(l).toContain("Specialty,Paediatrics");
    expect(csv).not.toMatch(/,ward7|,80\+|,female|,admitted\b/);
  });

  it("lists no filter rows when none are set", () => {
    const all = lines(analysisCsv("prevalence", prevalence, ctx()));
    const l = all.slice(
      0,
      all.findIndex((x) => x.startsWith("Note,")),
    );
    expect(l).toHaveLength(3);
    for (const label of ["Condition,", "Age band,", "Sex,", "Source,"])
      expect(l.some((x) => x.startsWith(label))).toBe(false);
  });

  it("the source is written by its label", () => {
    const csv = analysisCsv(
      "prevalence",
      prevalence,
      ctx({ ...F, source: "results_system" }),
    );
    expect(lines(csv)).toContain("Source,Results system");
    expect(csv).not.toContain("results_system");
  });

  it("hidden values read Fewer than 5", () => {
    const l = lines(analysisCsv("affected", hiddenAffected, ctx()));
    expect(l).toContain("80 and over,Fewer than 5");
    expect(l).toContain("0–17,0");
    expect(l).toContain("Female,Fewer than 5");
    expect(l).toContain("Admitted,Fewer than 5");
    expect(l).toContain("Ward 7 (Paediatrics),Fewer than 5");
    expect(l).toContain("Paediatrics,Fewer than 5");
    expect(l).toContain("Patients,Fewer than 5");
    const p = lines(analysisCsv("prevalence", prevalence, ctx()));
    expect(p).toContain("2026-07-31,Fewer than 5,Fewer than 5");
  });

  it("Not standardised is a row", () => {
    const l = lines(analysisCsv("prevalence", prevalence, ctx()));
    expect(l).toContain("Not standardised,20,5,15");
    expect(l).toContain("Type 2 diabetes · E11,100,25,75");
  });

  it("no pid, no drill key, no patient fields", async () => {
    const mock = createMockAnalysis({ delayMs: 0 });
    for (const view of VIEWS) {
      const data = await mock.getView(view, F);
      const csv = analysisCsv(view, data, ctx());
      const drills = JSON.stringify(data).match(/"drill":"[^"]+"/g) ?? [];
      for (const d of drills) expect(csv).not.toContain(d.slice(9, -1));
      expect(csv).not.toMatch(/P-[A-Z0-9]{4,12}/);
      expect(csv.toLowerCase()).not.toMatch(/\bpid\b|drill|mrn|date of birth/);
    }
  });

  it("writes every view's tables", async () => {
    const mock = createMockAnalysis({ delayMs: 0 });
    const f = { ...F, from: "2025-10-22", to: "2026-10-21" };
    const find = lines(
      analysisCsv("findings", await mock.getView("findings", f), ctx(f)),
    );
    expect(find).toContain("Severity,Alerts");
    expect(find.some((x) => x.startsWith("Critical,"))).toBe(true);
    expect(find.some((x) => x.startsWith("Not clinically relevant,"))).toBe(
      true,
    );
    const q = lines(
      analysisCsv("quality", await mock.getView("quality", f), ctx(f)),
    );
    expect(q.some((x) => x.includes("Needs review"))).toBe(true);
    const c = lines(
      analysisCsv(
        "co-occurring",
        await mock.getView("co-occurring", f),
        ctx(f),
      ),
    );
    expect(c.some((x) => x.startsWith("Condition A,Condition B"))).toBe(true);
  });

  it("stops at the row limit", () => {
    const many: PrevalenceOut = {
      ...prevalence,
      series: Array.from({ length: CSV_MAX_ROWS + 50 }, () => ({
        start: "2026-07-24",
        cases: S(0),
        new: S(0),
      })),
    };
    const l = lines(analysisCsv("prevalence", many, ctx()));
    // The header, the rows, and the closing empty string after the last CRLF.
    expect(l.length).toBeLessThanOrEqual(CSV_MAX_ROWS + 2);
  });
});

describe("csvFilename", () => {
  it("names the view and the period", () => {
    expect(csvFilename("prevalence", F)).toBe(
      "mhai-analysis-prevalence-2026-07-24-to-2026-10-22.csv",
    );
    expect(csvFilename("co-occurring", F)).toBe(
      "mhai-analysis-co-occurring-2026-07-24-to-2026-10-22.csv",
    );
  });
});
