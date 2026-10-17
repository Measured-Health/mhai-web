import type {
  ActivityEventOut,
  GuardedOut,
  UsageOut,
} from "../api/admin-contract";
import { RESULT_LABEL } from "../labels";
import { FLAG_LABEL, actorName, describeEvent, typeLabel } from "./activity";
import { DISMISS_REASONS, SEVERITY } from "../notifications/alert-view";
import { FEWER_THAN_5 } from "../small-groups";
import {
  SEVERITY_ORDER,
  TOP_MAX,
  criticalTargetLabel,
  findingLabel,
  placeLabel,
  readAlerts,
  shown,
  type MeasureKind,
} from "./alert-usage";
import { CONFIDENCE_ORDER, PERIODS } from "./report";

/** The activity export stops here (R10). */
export const CSV_MAX_ROWS = 10_000;

export type Cell = string | number | null;

// A spreadsheet runs a cell that starts with one of these (formula injection).
const RISKY = /^[=+\-@\t\r]/;

export function csvCell(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = RISKY.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 with a byte-order mark (Excel), CRLF lines (RFC 4180). */
export const toCsv = (header: string[], rows: Cell[][]) =>
  "\uFEFF" +
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
  "\r\n";

/** The one row a failed alerts block leaves, so the file never reads as none. */
export const ALERTS_CSV_FAILED = "Couldn't load";

/** "Fewer than 5" for a hidden value, empty for nothing measured. */
function alertCell(g: GuardedOut | undefined, kind: MeasureKind): Cell {
  const s = shown(g, kind);
  if (s.kind === "hidden") return FEWER_THAN_5;
  if (s.kind === "none") return null;
  if (kind === "share") return Math.round(s.value * 100);
  if (kind === "minutes") return Math.round(s.value);
  return s.value;
}

/**
 * The alert numbers for the Usage export: this period's counts only, the
 * small-group rule, no changes or flags. It reads the validated block from
 * `readAlerts`; a block that failed validation (including one whose hidden
 * values could be worked out from the totals) leaves one "couldn't load" row.
 */
export function alertsCsvRows(u: Pick<UsageOut, "alerts">): Cell[][] {
  const s = readAlerts(u);
  if (s.state === "off") return [];
  if (s.state === "failed") return [["Alerts", ALERTS_CSV_FAILED]];
  const a = s.alerts;
  return [
    ["Alerts: total", alertCell(a.total, "count")],
    ...SEVERITY_ORDER.map((k): Cell[] => [
      `Alerts: ${SEVERITY[k].label}`,
      alertCell(a.by_severity[k], "count"),
    ]),
    ["Alerts: still unhandled", alertCell(a.unhandled, "count")],
    [
      "Alerts: median time to acknowledge (minutes)",
      alertCell(a.median_ack_minutes, "minutes"),
    ],
    [
      "Alerts: median for Critical alerts (minutes)",
      alertCell(a.median_ack_minutes_critical, "minutes"),
    ],
    [
      `Alerts: ${criticalTargetLabel(a.critical_target_minutes)} (%)`,
      alertCell(a.critical_within_target, "share"),
    ],
    ["Alerts: acknowledged (%)", alertCell(a.acknowledged_share, "share")],
    ["Alerts: dismissed (%)", alertCell(a.dismissed_share, "share")],
    ...DISMISS_REASONS.map((r): Cell[] => [
      `Alerts: dismissed as ${r.label}`,
      alertCell(
        a.dismiss_reasons.find((x) => x.reason === r.code)?.count,
        "count",
      ),
    ]),
    ...a.top_findings
      .slice(0, TOP_MAX)
      .map((f): Cell[] => [
        `Alerts: finding ${findingLabel(f)}`,
        alertCell(f.count, "count"),
      ]),
    ...a.top_locations
      .slice(0, TOP_MAX)
      .map((l): Cell[] => [
        `Alerts: location ${placeLabel(l.location)}`,
        alertCell(l.count, "count"),
      ]),
    // readAlerts has checked every bucket and total (F4): no fallback here.
    ...a.series.points.map((p): Cell[] => [
      a.series.bucket === "week"
        ? `Alerts in the week of ${p.start.slice(0, 10)}`
        : `Alerts on ${p.start.slice(0, 10)}`,
      p.total,
    ]),
  ];
}

/** Counts only: nothing clinical, and alert groups under the small-group rule (spec §5.6). */
export function usageCsv(u: UsageOut, hospital: string): string {
  const period = PERIODS.find((p) => p.id === u.period)?.label ?? "Period";
  const rows: Cell[][] = [
    ["Hospital", hospital],
    ["Period", `${period} (${u.from.slice(0, 10)} to ${u.to.slice(0, 10)})`],
    ["Consultations", u.consultations],
    ["Active clinicians", u.active_clinicians],
    [
      "Agreed with result (%)",
      u.agreement_rate === null ? null : Math.round(u.agreement_rate * 100),
    ],
    ["Median review time (hours)", u.median_review_hours],
    ...CONFIDENCE_ORDER.map((k): Cell[] => [
      `Result: ${RESULT_LABEL[k]}`,
      u.confidence[k],
    ]),
    ...u.by_specialty.map((s): Cell[] => [
      `Specialty: ${s.specialty}`,
      s.consultations,
    ]),
    ...alertsCsvRows(u),
  ];
  return toCsv(["Measure", "Value"], rows);
}

/** The log as shown on screen (R9): structured fields only. */
export const activityCsv = (events: ActivityEventOut[]) =>
  toCsv(
    ["Time (UTC)", "Who", "Type", "What happened", "Flag"],
    events
      .slice(0, CSV_MAX_ROWS)
      .map((e) => [
        e.at,
        actorName(e),
        typeLabel(e),
        describeEvent(e),
        e.flag ? FLAG_LABEL[e.flag] : null,
      ]),
  );

export const csvName = (
  what: "usage" | "activity",
  hospital: string,
  now: number,
) =>
  `${hospital
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(
      /^-|-$/g,
      "",
    )}-${what}-${new Date(now).toISOString().slice(0, 10)}.csv`;

/** Hands the file to the browser's download. Nothing is stored (R10). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
