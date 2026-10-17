import type { ActivityEventOut, UsageOut } from "../api/admin-contract";
import { RESULT_LABEL } from "../labels";
import { FLAG_LABEL, actorName, describeEvent, typeLabel } from "./activity";
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

/** Counts only: there is nothing clinical in usage (spec §5.6). */
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
