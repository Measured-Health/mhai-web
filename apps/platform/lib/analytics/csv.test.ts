import { describe, expect, it } from "vitest";
import { CSV_MAX_ROWS } from "@mhai/ui/csv";
import type {
  AnalyticsOut,
  Change,
  ChangesOut,
  Period,
} from "../api/analytics-contract";
import {
  buildAnalytics,
  seedChanges,
  type AnalyticsMode,
} from "../api/analytics-fixtures";
import {
  CSV_FAILED,
  CSV_OFF,
  CSV_SECTIONS,
  analyticsCsv,
  analyticsCsvName,
} from "./csv";

// The latest finished week is 1–7 Nov, month October, quarter Jul–Sep.
const NOW = Date.parse("2026-11-11T09:30:00.000Z");
const sample = (mode: AnalyticsMode = "normal", period: Period = "month") =>
  buildAnalytics(period, NOW, mode, seedChanges(NOW, mode));
const lines = (csv: string) =>
  csv.replace(/^﻿/, "").replace(/\r\n$/, "").split("\r\n");
type Ok<T> = Exclude<T, { unavailable: true } | { not_yet: true } | null>;
const ok = <T>(v: T) => v as Ok<T>;
const changes = (a: AnalyticsOut) => a.what_changed as ChangesOut;

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
  it("every section present, each row naming its period by its dates (F15)", () => {
    const csv = analyticsCsv(sample(), "month");
    expect(CSV_SECTIONS).toEqual([
      "What changed",
      "Use",
      "Alert safety",
      "Answer quality",
      "Hospitals",
    ]);
    for (const s of CSV_SECTIONS) expect(lines(csv)).toContain(s);
    expect(lines(csv)[0]).toBe("Analytics,Last month,Month 1–31 Oct 2026");
    expect(csv.startsWith("﻿")).toBe(true);
    const use = section(csv, "Use");
    expect(use[0]).toBe(
      "Period,Hospital,Questions,Active clinicians,Questions per active clinician",
    );
    expect(use.slice(1).map((l) => l.split(",")[1])).toEqual([
      "Havana Hospital",
      "Northgate General Hospital",
      "Riverside Children's Hospital",
      "Lakeside Community Clinic",
      "Hilltop Cottage Hospital",
      "Median of all hospitals",
    ]);
    for (const l of use.slice(1))
      expect(l.startsWith("Month 1–31 Oct 2026,")).toBe(true);
    // Alert safety isn't switched on (F4).
    expect(section(csv, "Alert safety")).toEqual([CSV_OFF]);
    // What changed names both periods it compares, per day: never a total.
    const what = section(csv, "What changed");
    expect(what).toHaveLength(7);
    expect(what[1]).toMatch(
      /^"Week 1–7 Nov 2026 against Month 1–31 Oct 2026, per day",Northgate General Hospital,Answer quality,/,
    );
    expect(section(csv, "Hospitals")).toHaveLength(6);
    expect(section(csv, "Answer quality")).toHaveLength(7);
  });

  it("weeks are named by their date range", () => {
    const csv = analyticsCsv(sample("normal", "week"), "week");
    expect(lines(csv)[0]).toBe("Analytics,Last week,Week 1–7 Nov 2026");
    expect(section(csv, "Use")[1]).toMatch(/^Week 1–7 Nov 2026,Havana/);
  });

  it("hidden values written as 'Fewer than 5'; zeros show", () => {
    const csv = analyticsCsv(sample("normal", "week"), "week");
    const lakeside = section(csv, "Use").find((l) => l.includes("Lakeside"))!;
    expect(lakeside.split(",").slice(2)).toEqual([
      "Fewer than 5",
      "Fewer than 5",
      "Fewer than 5",
    ]);
    const hilltop = section(csv, "Use").find((l) => l.includes("Hilltop"))!;
    expect(hilltop.split(",").slice(2)).toEqual(["0", "0", ""]);
    for (const l of section(csv, "Hospitals").slice(1))
      for (const c of l.split(",").slice(2)) expect(c).not.toMatch(/^[1-4]$/);
  });

  it('an unavailable area written as "Couldn\'t load"', () => {
    const csv = analyticsCsv(sample("unavailable"), "month");
    expect(CSV_FAILED).toBe("Couldn't load");
    for (const s of CSV_SECTIONS.filter((x) => x !== "Alert safety"))
      expect(section(csv, s)).toEqual([CSV_FAILED]);
    // A leak the reader refuses is written the same way, and never shows.
    const leak = structuredClone(sample());
    ok(leak.use).rows[3]!.questions = { value: 3, suppressed: false };
    const out = analyticsCsv(leak, "month");
    expect(section(out, "Use")).toEqual([CSV_FAILED]);
    expect(section(out, "Answer quality").length).toBeGreaterThan(1);
  });

  it("before the first period: when figures start, never zeros (F19)", () => {
    const csv = analyticsCsv(sample("not_yet"), "month");
    expect(lines(csv)[0]).toBe("Analytics,Last month,No period published yet");
    for (const s of ["Use", "Answer quality", "Hospitals"])
      expect(section(csv, s)).toEqual(["First figures after 1–31 Dec 2026"]);
    expect(section(csv, "What changed")).toEqual([CSV_FAILED]);
  });

  it("no patient fields, no notes", () => {
    const csv = analyticsCsv(sample("normal", "quarter"), "quarter");
    expect(csv).not.toMatch(/patient|mrn|date of birth|question text/i);
    expect(csv).not.toContain("Musa Danjuma");
    expect(csv).not.toMatch(/\bNote\b/);
    const rch = section(csv, "What changed").find((l) =>
      l.includes("Riverside"),
    )!;
    expect(rch).toContain("Tunde Okafor");
  });

  it("stops at CSV_MAX_ROWS rows", () => {
    const a: AnalyticsOut = structuredClone(sample());
    const base = changes(a).items[2]!;
    const many: Change[] = Array.from(
      { length: CSV_MAX_ROWS + 50 },
      (_, i) => ({ ...structuredClone(base), id: `chg_many_${i}` }),
    );
    changes(a).items = [...changes(a).items, ...many];
    const csv = analyticsCsv(a, "month");
    const ls = lines(csv);
    expect(ls.at(-1)).toBe(`Stopped at ${CSV_MAX_ROWS} rows`);
    expect(ls.at(-2)).toBe("");
    expect(ls.length - 2).toBe(CSV_MAX_ROWS);
    expect(section(csv, "What changed").length).toBeGreaterThan(100);
    expect(section(csv, "Hospitals")).toHaveLength(6);
    expect(analyticsCsv(sample(), "month")).not.toContain("Stopped at");
  });

  it("names the file by the period kind and date", () => {
    expect(analyticsCsvName("month", NOW)).toBe(
      "analytics-last-month-2026-11-11.csv",
    );
  });
});
