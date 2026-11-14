import type {
  ActivityEventOut,
  GuardedOut,
  UsageOut,
} from "../api/admin-contract";
import { RESULT_LABEL } from "../labels";
import { FLAG_LABEL, actorName, describeEvent, typeLabel } from "./activity";
import { SEVERITY } from "../notifications/alert-view";
import { CSV_MAX_ROWS, toCsv, type Cell } from "@mhai/ui/csv";
import { FEWER_THAN_5 } from "@mhai/ui/small-groups";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  HANDLING_LABEL,
  HANDLING_ORDER,
  ROUTE_LABEL,
  ROUTE_ORDER,
  SEVERITY_ORDER,
  readAlerts,
  shown,
} from "./alert-usage";
import { CONFIDENCE_ORDER, PERIODS } from "./report";

/** The one row a failed alerts block leaves, so the file never reads as none. */
export const ALERTS_CSV_FAILED = "Couldn't load";

/** "Fewer than 5" for a hidden count, as the screen says it. */
function alertCell(g: GuardedOut): Cell {
  const s = shown(g);
  if (s.kind === "hidden") return FEWER_THAN_5;
  if (s.kind === "none") return null;
  return s.value;
}

/**
 * The alert numbers for the Usage export: exactly the screen's rows, in its
 * words, under the small-group rule. A block that failed `readAlerts`
 * (including one whose hidden values could be worked out) leaves one
 * "couldn't load" row.
 */
export function alertsCsvRows(u: Pick<UsageOut, "alerts">): Cell[][] {
  const s = readAlerts(u);
  if (s.state === "off") return [];
  if (s.state === "failed") return [["Alerts", ALERTS_CSV_FAILED]];
  const a = s.alerts;
  return [
    ["Alerts: total", alertCell(a.total)],
    ...SEVERITY_ORDER.map((k): Cell[] => [
      `Alerts: ${SEVERITY[k].label}`,
      alertCell(a.by_severity[k]),
    ]),
    ...HANDLING_ORDER.map((k): Cell[] => [
      `Alerts: ${HANDLING_LABEL[k]}`,
      alertCell(a.by_handling[k]),
    ]),
    ...ROUTE_ORDER.map((k): Cell[] => [
      `Alerts: ${ROUTE_LABEL[k]}`,
      alertCell(a.by_route[k]),
    ]),
    ...CATEGORY_ORDER.map((k): Cell[] => [
      `Alerts: ${CATEGORY_LABEL[k]}`,
      alertCell(a.by_category[k]),
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

// The generic helpers live in @mhai/ui; callers keep importing them from here.
export {
  CSV_MAX_ROWS,
  csvCell,
  downloadCsv,
  toCsv,
  type Cell,
} from "@mhai/ui/csv";
