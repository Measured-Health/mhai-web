import { describe, expect, it } from "vitest";
import {
  VIEW_IDS,
  type AnalysisQuery,
  type AnalysisStatus,
  type FilterOptionsOut,
  type ViewId,
} from "../api/analysis-contract";
import { PROFILES } from "../api/analysis-fixtures";
import { TEAM_EMAILS } from "../api/fixtures";
import { createMockPlatform } from "../api/mock";
import { analysisCsv, analysisCsvName } from "./csv";
import { emptyQuery } from "./filters";
import { SEX_LABEL } from "./labels";
import { readFilterOptions, readStatus, readView } from "./read";

const NOW = Date.parse("2026-10-23T09:30:00.000Z");
const mock = () =>
  createMockPlatform({ now: () => NOW, me: () => TEAM_EMAILS.ada, delayMs: 0 });
type Mock = ReturnType<typeof mock>;

async function context(m: Mock, q: AnalysisQuery) {
  const s = readStatus(await m.getAnalysisStatus());
  const o = readFilterOptions(
    await m.getAnalysisFilters(q.scope, q.hospital),
    q.scope,
  );
  if (s.status !== "ok" || o.status !== "ok") throw new Error("not read");
  return { status: s.data, options: o.data };
}
async function csvOf(m: Mock, view: ViewId, q: AnalysisQuery) {
  const v = readView(view, await m.getAnalysisView(view, q), q, NOW);
  if (v.status !== "ok") throw new Error(`${view} failed`);
  return analysisCsv(view, v, await context(m, q));
}
/** The cells, row by row (RFC 4180: a quoted cell may hold a comma). */
function cells(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  return rows.map((r) => (r.length === 1 && r[0] === "" ? [] : r));
}

const ALL = emptyQuery("all", null);
const HAVANA = emptyQuery("hospital", "h_havana");

describe("analysisCsv", () => {
  it("the header rows list scope, months, filters by label and Sample data", async () => {
    const m = mock();
    const q: AnalysisQuery = {
      ...HAVANA,
      condition: "e11",
      age_band: "18-39",
      sex: "female",
      location: "ward4",
    };
    const rows = cells(await csvOf(m, "prevalence", q));
    expect(rows[0]).toEqual(["Prevalence and trends"]);
    expect(rows).toContainEqual(["Scope", "One hospital"]);
    expect(rows).toContainEqual(["Hospital", "Havana Hospital"]);
    expect(rows).toContainEqual(["Months", "Oct 2025 to Sep 2026"]);
    expect(rows).toContainEqual(["Period", "Last 12 months"]);
    expect(rows).toContainEqual(["Condition", "Type 2 diabetes · E11"]);
    expect(rows).toContainEqual(["Age band", "18–39"]);
    expect(rows).toContainEqual(["Sex", "Female"]);
    expect(rows).toContainEqual(["Ward or clinic", "Ward 4 (Medical)"]);
    expect(rows).toContainEqual(["Hospitals", "10 of 12 hospitals included"]);
    expect(rows).toContainEqual(["Sample data"]);
    // The header comes before the tables.
    const sample = rows.findIndex((r) => r[0] === "Sample data");
    expect(sample).toBeLessThan(rows.findIndex((r) => r[0] === "Headline"));

    const across = cells(await csvOf(m, "affected", ALL));
    expect(across).toContainEqual(["Scope", "All hospitals"]);
    expect(across.some((r) => r[0] === "Hospital")).toBe(true); // the rows' header
    expect(across.slice(0, 8).some((r) => r[0] === "Hospital")).toBe(false);
  });

  it("the header's filters are the ones the reply was read against (I1)", async () => {
    const m = mock();
    const asked: AnalysisQuery = { ...ALL, sex: "female" };
    const v = readView(
      "prevalence",
      await m.getAnalysisView("prevalence", asked),
      asked,
      NOW,
    );
    if (v.status !== "ok") throw new Error("failed");
    // The screen has moved on to other filters; the file still says Female.
    const rows = cells(analysisCsv("prevalence", v, await context(m, ALL)));
    expect(rows).toContainEqual(["Sex", "Female"]);
  });

  it("hidden values read Fewer than 5 or Too few hospitals to show", async () => {
    const m = mock();
    const tb = await csvOf(m, "prevalence", { ...ALL, condition: "a15" });
    expect(tb).toContain("Too few hospitals to show");
    const sc = await csvOf(m, "prevalence", { ...ALL, condition: "d57" });
    expect(sc).toContain("Fewer than 5");
  });

  it("hidden rates and shares write Not shown, hidden counts Fewer than 5, as on screen", async () => {
    const m = mock();
    const hidden = { value: null, suppressed: true };
    const n25 = { value: 25, suppressed: false };
    const prev = readView(
      "prevalence",
      await m.getAnalysisView("prevalence", ALL),
      ALL,
      NOW,
    );
    if (prev.status !== "ok") throw new Error("prevalence failed");
    const c = prev.data.data.by_condition;
    c[0] = {
      ...c[0]!,
      cases: { ...n25, drill: null },
      rate: { count: n25, base: hidden, per_1000: hidden },
    };
    c[1] = {
      ...c[1]!,
      cases: { ...hidden, drill: null },
      rate: { count: hidden, base: c[1]!.rate.base, per_1000: hidden },
    };
    prev.data.headline = { ...prev.data.headline, per_1000: hidden };
    const h = prev.data.hospitals!;
    h[0] = {
      ...h[0]!,
      headline: { ...h[0]!.headline, count: n25, per_1000: hidden },
      not_standardised_share: hidden,
    };
    const rows = cells(analysisCsv("prevalence", prev, await context(m, ALL)));
    const byName = (name: string) => rows.find((r) => r[0] === name)!;
    const first = byName(c[0]!.condition.name!);
    expect(first[2]).toBe("25");
    expect(first[3]).toBe("Not shown");
    const second = byName(c[1]!.condition.name!);
    expect(second[2]).toBe("Fewer than 5");
    expect(second[3]).toBe("Not shown");
    const hosp = byName(h[0]!.hospital.name);
    expect(hosp[2]).toBe("Not shown · 25");
    expect(hosp[5]).toBe("Not shown");
    // The headline holds only what the sentence shows: a hidden rate, and
    // no count or base beside it (final review I1).
    const at = rows.findIndex((r) => r[0] === "Headline");
    expect(rows[at + 1]).toEqual(["Cases per 1,000"]);
    expect(rows[at + 2]).toEqual(["Not shown"]);
    expect(rows[at + 3]).toEqual([]);
    expect(rows.flat()).not.toContain("Fewer than 5 · 25");

    const aff = readView(
      "affected",
      await m.getAnalysisView("affected", ALL),
      ALL,
      NOW,
    );
    if (aff.status !== "ok") throw new Error("affected failed");
    const sex = aff.data.data.by_sex;
    sex[0] = { ...sex[0]!, patients: { ...n25, drill: null }, share: hidden };
    const arows = cells(analysisCsv("affected", aff, await context(m, ALL)));
    expect(arows.find((r) => r[0] === SEX_LABEL[sex[0]!.sex])).toEqual([
      SEX_LABEL[sex[0]!.sex],
      "Not shown",
      "25",
    ]);
  });

  it("the headline holds only what each view's summary shows (final review I1)", async () => {
    const m = mock();
    for (const view of ["affected", "co-occurring", "findings"] as const) {
      const rows = cells(await csvOf(m, view, ALL));
      const at = rows.findIndex((r) => r[0] === "Headline");
      expect(rows[at + 1], view).toEqual(["Patients in the group"]);
      expect(rows[at + 2], view).toHaveLength(1);
      expect(rows[at + 3], view).toEqual([]);
    }
    const prev = cells(await csvOf(m, "prevalence", ALL));
    const p = prev.findIndex((r) => r[0] === "Headline");
    expect(prev[p + 1]).toEqual(["Cases per 1,000", "Cases", "Patients seen"]);
    const q = cells(await csvOf(m, "quality", ALL));
    const at = q.findIndex((r) => r[0] === "Headline");
    expect(q[at + 1]).toEqual(["Reviewers agreed", "Rated"]);
    expect(q.flat()).not.toContain("Ratings agreed with");
  });

  it("findings: Not standardised for no name and No flag for none, as on screen", async () => {
    const m = mock();
    const f = readView(
      "findings",
      await m.getAnalysisView("findings", ALL),
      ALL,
      NOW,
    );
    if (f.status !== "ok") throw new Error("findings failed");
    const list = f.data.data.findings;
    list[0] = { ...list[0]!, name: null, flag: null };
    const rows = cells(analysisCsv("findings", f, await context(m, ALL)));
    expect(
      rows.some((r) => r[0] === "Not standardised" && r[1] === "No flag"),
    ).toBe(true);
    expect(rows.flat()).not.toContain("Not named");
  });

  it("the monthly median: Not enough similar hospitals when hidden, and no column without a comparison", async () => {
    const m = mock();
    const v = readView(
      "prevalence",
      await m.getAnalysisView("prevalence", HAVANA),
      HAVANA,
      NOW,
    );
    if (v.status !== "ok" || !v.data.comparison?.available)
      throw new Error("Havana should compare");
    v.data.data.series[0] = {
      ...v.data.data.series[0]!,
      median: { value: null, suppressed: true },
    };
    const ctx = await context(m, HAVANA);
    const rows = cells(analysisCsv("prevalence", v, ctx));
    const at = rows.findIndex((r) => r[0] === "Cases per 1,000 by month");
    expect(rows[at + 1]).toContain("Median of similar hospitals");
    expect(rows[at + 2]!.at(-1)).toBe("Not enough similar hospitals");
    // Without an available comparison the screen has no median column.
    v.data.comparison = {
      ...v.data.comparison,
      available: false,
      reason: "too_few_peers",
      verdict: null,
      median: { value: null, suppressed: false },
    };
    const none = cells(analysisCsv("prevalence", v, ctx));
    const at2 = none.findIndex((r) => r[0] === "Cases per 1,000 by month");
    expect(none[at2 + 1]).not.toContain("Median of similar hospitals");
  });

  it("hospital rows across hospitals; comparison lines for one", async () => {
    const m = mock();
    const across = cells(await csvOf(m, "prevalence", ALL));
    const header = across.findIndex((r) => r[0] === "Hospital");
    expect(header).toBeGreaterThan(0);
    expect(across[header]).toEqual([
      "Hospital",
      "Patients seen",
      "Cases per 1,000",
      "Kind",
      "Coverage",
      "Not standardised",
      "Partly standardised",
    ]);
    const names = across.slice(header + 1, header + 11).map((r) => r[0]);
    expect(names).toContain("Havana Hospital");
    expect(names).toContain("Southpoint Hospital");
    expect(across.flat()).not.toContain("Last period");

    const one = await csvOf(m, "prevalence", HAVANA);
    expect(one).toContain("Median of 5 similar hospitals");
    expect(one).toContain("patients seen · General hospital");
    expect(cells(one).some((r) => r[0] === "Kind")).toBe(false);

    const quality = await csvOf(m, "quality", HAVANA);
    expect(quality).toMatch(/Last period|Not compared|Not enough similar/);
    const affected = await csvOf(m, "affected", HAVANA);
    expect(affected).not.toMatch(/Last period|similar hospitals/);
  });

  it("no ids, no drill keys, no patient fields", async () => {
    const m = mock();
    const ids = [
      ...PROFILES.map((p) => p.id),
      "e11",
      "ward4",
      "results_system",
      "main_record",
      "unmapped",
    ];
    for (const view of VIEW_IDS)
      for (const q of [
        ALL,
        HAVANA,
        { ...HAVANA, location: "ward4", source: "results_system" },
      ]) {
        const csv = await csvOf(m, view, q);
        for (const id of ids) expect(csv).not.toContain(id);
        expect(csv).not.toMatch(
          /\b(drill|pid|mrn|dob)\b|date of birth|address|patient_name/i,
        );
      }
  });

  it("stays within the row limit and starts with a byte-order mark", async () => {
    const csv = await csvOf(mock(), "findings", ALL);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("analysisCsvName", () => {
  it("names the scope, view and period, never a filter", () => {
    expect(analysisCsvName("prevalence", ALL, null)).toBe(
      "mhai-analysis-all-hospitals-prevalence-12m.csv",
    );
    expect(
      analysisCsvName(
        "co-occurring",
        { ...HAVANA, period: "3m", sex: "female" },
        "Havana Hospital",
      ),
    ).toBe("mhai-analysis-havana-hospital-co-occurring-3m.csv");
    expect(
      analysisCsvName("quality", HAVANA, "Riverside Children's (East)"),
    ).toBe("mhai-analysis-riverside-children-s-east-quality-12m.csv");
  });
});

// The types the context takes.
void ({} as { status: AnalysisStatus; options: FilterOptionsOut | null });
