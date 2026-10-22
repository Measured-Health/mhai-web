import { describe, expect, it } from "vitest";
import { CSV_MAX_ROWS } from "@mhai/ui/csv";
import type { AnalyticsOut, Change, Period } from "../api/analytics-contract";
import {
  buildAnalytics,
  seedChanges,
  type AnalyticsMode,
} from "../api/analytics-fixtures";
import {
  CSV_FAILED,
  CSV_SECTIONS,
  analyticsCsv,
  analyticsCsvName,
} from "./csv";

const NOW = Date.parse("2026-10-22T09:30:00.000Z");
const sample = (mode: AnalyticsMode = "normal", period: Period = "30d") =>
  buildAnalytics(period, NOW, mode, seedChanges(NOW, mode));
const lines = (csv: string) =>
  csv.replace(/^﻿/, "").replace(/\r\n$/, "").split("\r\n");
type Ok<T> = Exclude<T, { unavailable: true }>;
const ok = <T>(v: T) => v as Ok<T>;

/** The lines of one section, its heading excluded. */
function section(csv: string, name: string): string[] {
  const ls = lines(csv);
  const i = ls.indexOf(name);
  if (i < 0) throw new Error(`no section ${name}`);
  const out: string[] = [];
  for (let j = i + 1; j < ls.length && ls[j] !== ""; j++) out.push(ls[j]!);
  return out;
}

describe("analyticsCsv", () => {
  it("every section present", () => {
    const csv = analyticsCsv(sample(), "30d");
    expect(CSV_SECTIONS).toEqual([
      "What changed",
      "Use",
      "Alert safety",
      "Answer quality",
      "Hospitals",
    ]);
    for (const s of CSV_SECTIONS) expect(lines(csv)).toContain(s);
    expect(lines(csv)[0]).toMatch(/^Analytics,Last 30 days/);
    // Excel's byte-order mark and CRLF lines.
    expect(csv.startsWith("﻿")).toBe(true);
    // A header then one row per hospital (and the median) in each table.
    const use = section(csv, "Use");
    expect(use[0]).toBe(
      "Hospital,Questions,Active clinicians,Questions per active clinician",
    );
    expect(use.slice(1).map((l) => l.split(",")[0])).toEqual([
      "Havana Hospital",
      "Northgate General Hospital",
      "Riverside Children's Hospital",
      "Lakeside Community Clinic",
      "Hilltop Cottage Hospital",
      "Median of all hospitals",
    ]);
    const changes = section(csv, "What changed");
    expect(changes).toHaveLength(7);
    expect(changes[1]).toMatch(/^Northgate General Hospital,Alert safety,/);
    expect(section(csv, "Hospitals")).toHaveLength(6);
    expect(section(csv, "Alert safety")).toHaveLength(7);
    expect(section(csv, "Answer quality")).toHaveLength(7);
  });

  it("hidden values written as 'Fewer than 5'", () => {
    const csv = analyticsCsv(sample(), "30d");
    const lakeside = section(csv, "Use").find((l) => l.startsWith("Lakeside"))!;
    expect(lakeside).toBe(
      "Lakeside Community Clinic,Fewer than 5,Fewer than 5,Fewer than 5",
    );
    // Zeros show; nothing to divide by is left empty.
    const hilltop = section(csv, "Use").find((l) => l.startsWith("Hilltop"))!;
    expect(hilltop).toBe("Hilltop Cottage Hospital,0,0,");
    const alerts = section(csv, "Alert safety").find((l) =>
      l.startsWith("Lakeside"),
    )!;
    expect(alerts.split(",").slice(1, 4)).toEqual([
      "Fewer than 5",
      "Fewer than 5",
      "Fewer than 5",
    ]);
    // Northgate's overdue Critical alerts are hidden too.
    const ngh = section(csv, "Alert safety").find((l) =>
      l.startsWith("Northgate"),
    )!;
    expect(ngh.split(",").at(-1)).toBe("Fewer than 5");
    // No raw 1–4 anywhere in a count column.
    for (const l of section(csv, "Hospitals").slice(1))
      for (const c of l.split(",").slice(1)) expect(c).not.toMatch(/^[1-4]$/);
  });

  it('an unavailable area written as "Couldn\'t load"', () => {
    const csv = analyticsCsv(sample("unavailable"), "7d");
    expect(CSV_FAILED).toBe("Couldn't load");
    for (const s of CSV_SECTIONS) expect(section(csv, s)).toEqual([CSV_FAILED]);
    expect(lines(csv)[0]).toMatch(/^Analytics,Last 7 days/);
    // A leak the reader refuses is written the same way, and never shows.
    const leak = structuredClone(sample());
    ok(leak.use).rows[3]!.questions = { value: 3, suppressed: false };
    const out = analyticsCsv(leak, "30d");
    expect(section(out, "Use")).toEqual([CSV_FAILED]);
    expect(section(out, "Alert safety").length).toBeGreaterThan(1);
    // The guard trips: What changed can't be written as a short list.
    expect(
      section(analyticsCsv(sample("guard"), "30d"), "What changed"),
    ).toEqual([CSV_FAILED]);
  });

  it("no patient fields", () => {
    const csv = analyticsCsv(sample(), "90d");
    expect(csv).not.toMatch(/patient|mrn|date of birth|question text/i);
    // Follow-up notes are free text: left out of the file.
    expect(csv).not.toContain("Musa Danjuma");
    expect(csv).not.toMatch(/\bNote\b/);
    // Who followed up and when are kept.
    const rch = section(csv, "What changed").find((l) =>
      l.startsWith("Riverside"),
    )!;
    expect(rch).toContain("Tunde Okafor");
  });

  it("stops at CSV_MAX_ROWS rows", () => {
    const a: AnalyticsOut = structuredClone(sample());
    const base = ok(a.changes).items[2]!;
    const many: Change[] = Array.from(
      { length: CSV_MAX_ROWS + 50 },
      (_, i) => ({
        ...structuredClone(base),
        id: `chg_many_${i}`,
      }),
    );
    ok(a.changes).items = [...ok(a.changes).items, ...many];
    const csv = analyticsCsv(a, "30d");
    const ls = lines(csv);
    // The whole file stops at the cap, and says so on its last line.
    expect(ls.at(-1)).toBe(`Stopped at ${CSV_MAX_ROWS} rows`);
    expect(ls.at(-2)).toBe("");
    expect(ls.length - 2).toBe(CSV_MAX_ROWS);
    // The changes list is what's cut: every area is still written.
    expect(section(csv, "What changed").length).toBeGreaterThan(100);
    expect(section(csv, "Hospitals")).toHaveLength(6);
    expect(section(csv, "Use")).toHaveLength(7);
    // Under the cap there's no such line.
    expect(analyticsCsv(sample(), "30d")).not.toContain("Stopped at");
  });

  it("names the file by date", () => {
    expect(analyticsCsvName("30d", NOW)).toBe(
      "analytics-last-30-days-2026-10-22.csv",
    );
  });
});
