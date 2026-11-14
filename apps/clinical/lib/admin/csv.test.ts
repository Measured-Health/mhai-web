import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageAlertsOut } from "@/lib/api/admin-contract";
import {
  ADMIN_NOW as NOW,
  makeEvent,
  mockAdminAs,
  mockAdminWith,
} from "@/tests/admin";
import {
  CSV_MAX_ROWS,
  activityCsv,
  alertsCsvRows,
  csvName,
  usageCsv,
} from "./csv";

afterEach(() => vi.restoreAllMocks());

describe("CSV (R10)", () => {
  it("exports usage as counts only", () => {
    const csv = usageCsv(
      {
        period: "this_month",
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-16T10:00:00.000Z",
        consultations: 1284,
        active_clinicians: 39,
        agreement_rate: 0.82,
        median_review_hours: 3.1,
        confidence: { high: 796, caution: 347, review: 103, failed: 38 },
        by_specialty: [{ specialty: "Paediatrics", consultations: 318 }],
        alerts: null,
      },
      "Havana Hospital",
    );
    expect(csv.split("\r\n")).toEqual([
      "\uFEFFMeasure,Value",
      "Hospital,Havana Hospital",
      "Period,This month (2026-10-01 to 2026-10-16)",
      "Consultations,1284",
      "Active clinicians,39",
      "Agreed with result (%),82",
      "Median review time (hours),3.1",
      "Result: High confidence,796",
      "Result: Use with caution,347",
      "Result: Needs review,103",
      "Result: Couldn't complete,38",
      "Specialty: Paediatrics,318",
      "",
    ]);
  });

  it("exports activity from structured fields only (privacy)", () => {
    const sneaky = {
      ...makeEvent({
        kind: "consultation_run",
        type: "consultation",
        specialty: "Cardiology",
        confidence: "review",
        flag: null,
        at: "2026-10-16T09:31:00.000Z",
        actor: { display_name: "Dr. Bello" },
      }),
      question_text: "chest pain in John Smith",
    };
    const csv = activityCsv([
      sneaky,
      makeEvent({
        kind: "sign_in_locked",
        type: "security",
        actor: null,
        target: { display_name: "=cmd()" },
        at: "2026-10-16T08:55:00.000Z",
      }),
    ]);
    expect(csv).not.toMatch(/John|chest/);
    expect(csv.split("\r\n").slice(0, 3)).toEqual([
      "\uFEFFTime (UTC),Who,Type,What happened,Flag",
      "2026-10-16T09:31:00.000Z,Dr. Bello,Consultation,Ran a consultation · Cardiology · Needs review,",
      "2026-10-16T08:55:00.000Z,System,Security,Too many failed sign-ins for =cmd() · account locked,",
    ]);
  });

  it("names the file after the hospital and the day", () => {
    expect(csvName("activity", "Havana Hospital", NOW)).toBe(
      "havana-hospital-activity-2026-10-16.csv",
    );
  });
});

describe("CSV row cap", () => {
  it("stops at the export limit", () => {
    const many = Array.from({ length: CSV_MAX_ROWS + 5 }, () => makeEvent());
    expect(activityCsv(many).split("\r\n").length).toBe(CSV_MAX_ROWS + 2);
  });
});

const EXPECTED_LABELS = [
  "Alerts: total",
  "Alerts: Critical",
  "Alerts: Urgent",
  "Alerts: Info",
  "Alerts: Not handled yet",
  "Alerts: Acknowledged",
  "Alerts: Dismissed",
  "Alerts: Withdrawn before anyone handled it",
  "Alerts: Hospital queue",
  "Alerts: Named clinicians",
  "Alerts: Blood chemistry",
  "Alerts: Blood count",
  "Alerts: Kidney function",
  "Alerts: Blood gases and lactate",
  "Alerts: Heart markers",
  "Alerts: Blood sugar",
  "Alerts: Vital signs",
  "Alerts: Infection markers",
];

describe("usage CSV: patient alerts", () => {
  const usage = (
    p: "this_month" | "last_month" | "last_90_days" = "this_month",
  ) => mockAdminAs(null).getUsage(p);
  const lines = (csv: string) => csv.slice(1).trim().split("\r\n");

  it("adds core's alert numbers, in the screen's words, under the small-group rule", async () => {
    const out = lines(usageCsv(await usage(), "Sample Hospital"));
    for (const l of [
      "Alerts: total,128",
      "Alerts: Critical,17",
      "Alerts: Not handled yet,9",
      "Alerts: Hospital queue,97",
      "Alerts: Blood chemistry,52",
      "Alerts: Blood gases and lactate,Fewer than 5",
    ])
      expect(out).toContain(l);
    expect(out.indexOf("Alerts: total,128")).toBeGreaterThan(
      out.findIndex((l) => l.startsWith("Specialty:")),
    );
    const labels = out
      .filter((l) => l.startsWith("Alerts"))
      .map((l) => l.slice(0, l.lastIndexOf(",")));
    expect(labels).toEqual(EXPECTED_LABELS);
  });

  it("never writes a hidden value or one worked out from the total", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const sev = (info: UsageAlertsOut["total"]) => ({
      alerts: { ...a, by_severity: { ...a.by_severity, info } },
    });
    // A raw 1 to 4: the whole block fails closed (F7).
    expect(alertsCsvRows(sev({ value: 3, suppressed: false }))).toEqual([
      ["Alerts", "Couldn't load"],
    ]);
    // One hidden member of a set that splits the total could be worked out.
    expect(alertsCsvRows(sev({ value: null, suppressed: true }))).toEqual([
      ["Alerts", "Couldn't load"],
    ]);
  });

  it("writes Fewer than 5 for a hidden group the set keeps safe", async () => {
    const edge = await mockAdminWith("edge").getUsage("this_month");
    const rows = alertsCsvRows(edge);
    expect(rows).toContainEqual(["Alerts: Critical", "Fewer than 5"]);
    expect(rows).toContainEqual(["Alerts: Urgent", "Fewer than 5"]);
    expect(rows).toContainEqual(["Alerts: Named clinicians", "Fewer than 5"]);
  });

  it("says Couldn't load instead of leaving the alerts out", async () => {
    const u = await mockAdminWith("unavailable").getUsage("this_month");
    expect(alertsCsvRows(u)).toEqual([["Alerts", "Couldn't load"]]);
    expect(usageCsv(u, "Sample Hospital")).toContain(
      "Alerts,Couldn't load\r\n",
    );
    expect(usageCsv(u, "Sample Hospital")).not.toContain("Alerts: total");
  });

  it("writes no alert rows with no record source", async () => {
    const u = await mockAdminWith("off").getUsage("this_month");
    expect(alertsCsvRows(u)).toEqual([]);
    expect(usageCsv(u, "Sample Hospital")).not.toMatch(/Alerts/);
  });
});
