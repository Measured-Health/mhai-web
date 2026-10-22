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
        count: 5,
        flag: "alert",
        at: "2026-10-16T08:55:00.000Z",
      }),
    ]);
    expect(csv).not.toMatch(/John|chest/);
    expect(csv.split("\r\n").slice(0, 3)).toEqual([
      "\uFEFFTime (UTC),Who,Type,What happened,Flag",
      "2026-10-16T09:31:00.000Z,Dr. Bello,Consultation,Ran a consultation · Cardiology · Needs review,",
      "2026-10-16T08:55:00.000Z,System,Security,5 failed sign-ins for =cmd() · account locked,Alert",
    ]);
  });

  it("exports a self role change with its flag", () => {
    const csv = activityCsv([
      makeEvent({
        kind: "self_role_change",
        type: "security",
        actor: { display_name: "Grace Nwosu" },
        target: { display_name: "Grace Nwosu" },
        roles_added: ["clinician"],
        flag: "alert",
        at: "2026-10-17T09:00:00.000Z",
      }),
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      "2026-10-17T09:00:00.000Z,Grace Nwosu,Security,Gave themselves the Clinician role,Alert",
    );
    expect(csv).not.toContain("self_role_change");
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
  "Alerts: still unhandled",
  "Alerts: median time to acknowledge (minutes)",
  "Alerts: median for Critical alerts (minutes)",
  "Alerts: Critical handled within 15 min (%)",
  "Alerts: acknowledged (%)",
  "Alerts: dismissed (%)",
  "Alerts: dismissed as Not clinically relevant",
  "Alerts: dismissed as Already known",
  "Alerts: dismissed as Wrong patient",
  "Alerts: dismissed as Other",
  "Alerts: finding Potassium · low",
  "Alerts: finding Sodium · low",
  "Alerts: finding Platelets · low",
  "Alerts: finding Not standardised",
  "Alerts: finding Haemoglobin · low",
  "Alerts: location Ward 3",
  "Alerts: location Emergency department",
  "Alerts: location Ward 5",
  "Alerts: location Location not recorded",
  "Alerts: location Outpatient · Cardiology clinic",
  "Alerts on 2026-10-01",
  "Alerts on 2026-10-02",
  "Alerts on 2026-10-03",
  "Alerts on 2026-10-04",
  "Alerts on 2026-10-05",
  "Alerts on 2026-10-06",
  "Alerts on 2026-10-07",
  "Alerts on 2026-10-08",
  "Alerts on 2026-10-09",
  "Alerts on 2026-10-10",
  "Alerts on 2026-10-11",
  "Alerts on 2026-10-12",
  "Alerts on 2026-10-13",
  "Alerts on 2026-10-14",
  "Alerts on 2026-10-15",
  "Alerts on 2026-10-16",
];

describe("usage CSV: patient alerts", () => {
  const usage = (
    p: "this_month" | "last_month" | "last_90_days" = "this_month",
  ) => mockAdminAs(null).getUsage(p);
  const lines = (csv: string) => csv.slice(1).trim().split("\r\n");

  it("adds the alert numbers under the small-group rule", async () => {
    const out = lines(usageCsv(await usage(), "Sample Hospital"));
    for (const l of [
      "Alerts: total,128",
      "Alerts: Critical,17",
      "Alerts: Urgent,46",
      "Alerts: Info,65",
      "Alerts: still unhandled,9",
      "Alerts: median time to acknowledge (minutes),22",
      "Alerts: median for Critical alerts (minutes),11",
      "Alerts: Critical handled within 15 min (%),71",
      "Alerts: acknowledged (%),82",
      "Alerts: dismissed (%),18",
      "Alerts: dismissed as Not clinically relevant,9",
      "Alerts: dismissed as Wrong patient,Fewer than 5",
      "Alerts: finding Potassium · low,31",
      "Alerts: finding Not standardised,11",
      "Alerts: location Location not recorded,8",
      "Alerts: location Outpatient · Cardiology clinic,Fewer than 5",
      "Alerts on 2026-10-14,23",
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

  it("writes weeks for the last 90 days", async () => {
    const out = lines(usageCsv(await usage("last_90_days"), "Sample Hospital"));
    expect(out).toContain("Alerts in the week of 2026-07-18,38");
    expect(
      out.filter((l) => l.startsWith("Alerts in the week of")),
    ).toHaveLength(13);
  });

  it("never writes a hidden value or one worked out from totals", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const sev = (info: UsageAlertsOut["total"]) => ({
      alerts: {
        ...a,
        by_severity: {
          ...a.by_severity,
          critical: { value: 60, suppressed: false, change: null },
          urgent: { value: 65, suppressed: false, change: null },
          info,
        },
      },
    });
    // A raw 1 to 4 in an additive set: the whole block fails closed (F7).
    expect(
      alertsCsvRows(sev({ value: 3, suppressed: false, change: null })),
    ).toEqual([["Alerts", "Couldn't load"]]);
    // One hidden member of an additive set could be worked out too.
    expect(
      alertsCsvRows(sev({ value: 3, suppressed: true, change: null })),
    ).toEqual([["Alerts", "Couldn't load"]]);
  });

  it("never writes a share or median computed over a hidden group (G1)", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const hide = { value: null, suppressed: true, change: null };
    const rows = alertsCsvRows({
      alerts: {
        ...a,
        by_severity: { ...a.by_severity, critical: hide, urgent: hide },
        median_ack_minutes_critical: hide,
        worsening: null,
      },
    });
    // "Critical handled within 15 min" would be a share of fewer than 5.
    expect(rows).toEqual([["Alerts", "Couldn't load"]]);
    const edge = await mockAdminWith("edge").getUsage("this_month");
    const edgeRows = alertsCsvRows(edge);
    expect(edgeRows).toContainEqual([
      "Alerts: Critical handled within 15 min (%)",
      "Fewer than 5",
    ]);
    expect(edgeRows).toContainEqual([
      "Alerts: median for Critical alerts (minutes)",
      "Fewer than 5",
    ]);
  });

  it("writes Fewer than 5 for hidden values outside a revealing set", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const rows = alertsCsvRows({
      alerts: {
        ...a,
        unhandled: { value: 3, suppressed: false, change: null },
        top_findings: [
          {
            name: "Potassium",
            flag: "low",
            count: { value: 2, suppressed: true },
          },
        ],
      },
    });
    expect(rows).toContainEqual(["Alerts: still unhandled", "Fewer than 5"]);
    expect(rows).toContainEqual([
      "Alerts: finding Potassium · low",
      "Fewer than 5",
    ]);
  });

  it("leaves a missing median empty, never 0", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const rows = alertsCsvRows({
      alerts: {
        ...a,
        median_ack_minutes: { value: null, suppressed: false, change: null },
      },
    });
    expect(rows).toContainEqual([
      "Alerts: median time to acknowledge (minutes)",
      null,
    ]);
  });

  it("says Couldn't load instead of leaving the alerts out", async () => {
    const u = await mockAdminWith("unavailable").getUsage("this_month");
    expect(alertsCsvRows(u)).toEqual([["Alerts", "Couldn't load"]]);
    expect(usageCsv(u, "Sample Hospital")).toContain(
      "Alerts,Couldn't load\r\n",
    );
    expect(usageCsv(u, "Sample Hospital")).not.toContain("Alerts: total");
  });

  it("fails closed on a half-built series, never zeros", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    const bad = (points: unknown, bucket: unknown = "day") =>
      alertsCsvRows({
        alerts: {
          ...a,
          series: { bucket, points },
        } as unknown as UsageAlertsOut,
      });
    const failed = [["Alerts", "Couldn't load"]];
    expect(bad([{ start: "2026-10-14", usual_multiple: null }])).toEqual(
      failed,
    );
    expect(
      bad([{ start: "2026-10-14", total: "x", usual_multiple: null }]),
    ).toEqual(failed);
    expect(bad([], "month")).toEqual(failed);
  });

  it("writes no alert rows when alerts are off", async () => {
    const u = await mockAdminWith("off").getUsage("this_month");
    expect(alertsCsvRows(u)).toEqual([]);
    expect(alertsCsvRows({})).toEqual([]);
    expect(usageCsv(u, "Sample Hospital")).not.toMatch(/Alerts/);
  });

  it("keeps a finding label that starts with a formula character inert", async () => {
    const a = (await usage()).alerts as UsageAlertsOut;
    for (const name of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      const csv = usageCsv(
        {
          ...(await usage()),
          alerts: {
            ...a,
            top_findings: [{ name, flag: null, count: a.total }],
          },
        },
        "Sample Hospital",
      );
      const row = lines(csv).find((l) => l.includes(`finding ${name}`));
      expect(row).toBeDefined();
      expect(row).toMatch(/^"?Alerts: finding /);
    }
  });
});
