// The analytics export (spec §4, §5): every area for the chosen period plus
// the What changed list, under the same small-group rule and the same
// fail-closed reading as the screen. Counts only: no patient fields, and
// no follow-up notes (free text).
import { CSV_MAX_ROWS, toCsv, type Cell } from "@mhai/ui/csv";
import { FEWER_THAN_5 } from "@mhai/ui/small-groups";
import type { AnalyticsOut, Guarded, Period } from "../api/analytics-contract";
import {
  MEASURE_KIND,
  isHidden,
  measureLabel,
  type MeasureKind,
} from "./measures";
import { AREA_TITLE, AREAS, readAnalytics, type AreaKey } from "./read";

/** The one row a failed or unavailable area leaves (as in Plan 5b). */
export const CSV_FAILED = "Couldn't load";
export const CSV_SECTIONS: readonly string[] = AREAS.map((k) => AREA_TITLE[k]);

const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};
const MEDIAN = "Median of all hospitals";
const DIRECTION: Record<string, string> = {
  worse: "Worse",
  better: "Better",
  rising: "Rising",
  falling: "Falling",
};

/**
 * "Fewer than 5" for hidden, empty for nothing to show; shares as whole
 * percentages, minutes whole, hours and rates to one place.
 */
function cell(g: Guarded, kind: MeasureKind): Cell {
  if (isHidden(g, kind)) return FEWER_THAN_5;
  if (g.value === null || !Number.isFinite(g.value)) return null;
  if (kind === "share") return Math.round(g.value * 100);
  if (kind === "count" || kind === "minutes") return Math.round(g.value);
  return Math.round(g.value * 10) / 10;
}

const day = (iso: string) => (typeof iso === "string" ? iso.slice(0, 10) : "");

type Table = { header: string[]; rows: Cell[][] };

/** Writes the file and keeps the data rows at CSV_MAX_ROWS at most. */
export function analyticsCsv(a: AnalyticsOut, period: Period): string {
  const s = readAnalytics(a);
  const tables: Partial<Record<AreaKey, Table>> = {};

  if (s.use.status === "ok") {
    const body = (r: (typeof s.use.rows)[number] | typeof s.use.median) => [
      cell(r.questions, "count"),
      cell(r.active_clinicians, "count"),
      cell(r.questions_per_clinician, "rate"),
    ];
    tables.use = {
      header: [
        "Hospital",
        "Questions",
        "Active clinicians",
        "Questions per active clinician",
      ],
      rows: [
        ...s.use.rows.map((r) => [r.hospital.name, ...body(r)]),
        [MEDIAN, ...body(s.use.median)],
      ],
    };
  }

  if (s.alerts.status === "ok") {
    const body = (
      r: (typeof s.alerts.rows)[number] | typeof s.alerts.median,
    ): Cell[] => [
      cell(r.by_severity.critical, "count"),
      cell(r.by_severity.urgent, "count"),
      cell(r.by_severity.info, "count"),
      cell(r.total, "count"),
      cell(r.unhandled, "count"),
      cell(r.median_ack_minutes, "minutes"),
      cell(r.critical_median_ack_minutes, "minutes"),
      cell(r.critical_within_target, "share"),
      r.critical_target_minutes,
      cell(r.critical_overdue, "count"),
    ];
    tables.alerts = {
      header: [
        "Hospital",
        "Critical",
        "Urgent",
        "Info",
        "Total",
        "Unhandled",
        "Median time to acknowledge (minutes)",
        "Critical median time to acknowledge (minutes)",
        "Critical within target (%)",
        "Critical target (minutes)",
        "Critical unhandled past target",
      ],
      rows: [
        ...s.alerts.rows.map((r) => [r.hospital.name, ...body(r)]),
        [MEDIAN, ...body(s.alerts.median)],
      ],
    };
  }

  if (s.quality.status === "ok") {
    const body = (
      r: (typeof s.quality.rows)[number] | typeof s.quality.median,
    ): Cell[] => [
      cell(r.answers, "count"),
      cell(r.needs_review_share, "share"),
      cell(r.confidence.high, "count"),
      cell(r.confidence.medium, "count"),
      cell(r.confidence.low, "count"),
      cell(r.agreement_rate, "share"),
      cell(r.median_review_hours, "hours"),
    ];
    tables.quality = {
      header: [
        "Hospital",
        "Answers",
        "Needing review (%)",
        "High confidence",
        "Medium confidence",
        "Low confidence",
        "Agreement on reviews (%)",
        "Median review time (hours)",
      ],
      rows: [
        ...s.quality.rows.map((r) => [r.hospital.name, ...body(r)]),
        [MEDIAN, ...body(s.quality.median)],
      ],
    };
  }

  if (s.hospitals.status === "ok")
    tables.hospitals = {
      header: ["Hospital", "Staff", "Active clinicians", "Questions"],
      rows: s.hospitals.rows.map((r) => [
        r.hospital.name,
        r.size.staff,
        cell(r.size.active_clinicians, "count"),
        cell(r.size.questions, "count"),
      ]),
    };

  if (s.changes.status === "ok")
    tables.changes = {
      header: [
        "Hospital",
        "Area",
        "Measure",
        "Direction",
        "Serious",
        "Previous",
        "Current",
        "Summary",
        "Followed up by",
        "Followed up on",
      ],
      rows: s.changes.items.map((c) => {
        const k = MEASURE_KIND[c.measure];
        return [
          c.hospital?.name ?? "All hospitals",
          AREA_TITLE[c.area],
          measureLabel(c.measure),
          DIRECTION[c.direction] ?? null,
          c.serious ? "Yes" : "No",
          cell(c.previous, k),
          cell(c.current, k),
          c.summary,
          c.follow_up?.by.name ?? null,
          c.follow_up ? day(c.follow_up.at) : null,
        ];
      }),
    };

  // The areas are short; the changes list takes what's left of the cap.
  let budget = CSV_MAX_ROWS;
  for (const k of AREAS)
    if (k !== "changes" && tables[k]) budget -= tables[k]!.rows.length;
  if (tables.changes)
    tables.changes.rows = tables.changes.rows.slice(0, Math.max(0, budget));

  const out: Cell[][] = [];
  for (const k of AREAS) {
    out.push([], [AREA_TITLE[k]]);
    const t = tables[k];
    if (!t) out.push([CSV_FAILED]);
    else out.push(t.header, ...t.rows);
  }
  return toCsv(
    ["Analytics", PERIOD_LABEL[period], `${day(a?.from)} to ${day(a?.to)}`],
    out,
  );
}

/** "analytics-last-30-days-2026-10-22.csv". */
export const analyticsCsvName = (period: Period, now: number) =>
  `analytics-${PERIOD_LABEL[period].toLowerCase().replace(/ /g, "-")}-${new Date(now).toISOString().slice(0, 10)}.csv`;
