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

  it("hospital rows across hospitals; comparison lines for one", async () => {
    const m = mock();
    const across = cells(await csvOf(m, "prevalence", ALL));
    const header = across.findIndex((r) => r[0] === "Hospital");
    expect(header).toBeGreaterThan(0);
    expect(across[header]).toEqual([
      "Hospital",
      "Patients seen",
      "Patients with a condition in scope",
      "Per 1,000 seen",
      "Kind",
      "Coverage",
      "Not standardised (%)",
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
