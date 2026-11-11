// The analytics export (spec §4, §5): every area for the chosen period plus
// the What changed list, under the same small-group rule and the same
// fail-closed reading as the screen. Each row names its period by its dates
// (F15); nothing adds periods together. Counts only: no patient fields, and
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
import { DIRECTION_WORD } from "./changes";
import {
  PERIOD_PICK,
  firstFiguresText,
  periodLabel,
  windowText,
} from "./periods";
import { AREA_TITLE, AREAS, readAnalytics, type AreaKey } from "./read";

/** The one row a failed or unavailable area leaves (as in Plan 5b). */
export const CSV_FAILED = "Couldn't load";
/** Alert safety while patient alerts don't exist (F4). */
export const CSV_OFF = "Not switched on";
export const CSV_SECTIONS: readonly string[] = AREAS.map((k) => AREA_TITLE[k]);

const MEDIAN = "Median of all hospitals";

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
  const s = readAnalytics(a, period);
  const tables: Partial<Record<AreaKey, Table>> = {};
  /** A line instead of a table: not yet, or not switched on. */
  const notes: Partial<Record<AreaKey, string>> = {};
  for (const k of ["use", "quality", "hospitals"] as const) {
    const st = s[k];
    if (st.status === "not_yet")
      notes[k] = firstFiguresText(period, st.first_from);
  }
  if (s.alerts.status === "off") notes.alerts = CSV_OFF;
  // Every figure of an area is the one period's.
  const named = s.from ? periodLabel(period, s.from) : "";
  const withPeriod = (t: Table): Table => ({
    header: ["Period", ...t.header],
    rows: t.rows.map((r) => [named, ...r]),
  });

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

  if (s.quality.status === "ok") {
    const body = (
      r: (typeof s.quality.rows)[number] | typeof s.quality.median,
    ): Cell[] => [
      cell(r.answers, "count"),
      cell(r.needs_review_share, "share"),
      cell(r.reviews, "count"),
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
        "Reviews",
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
        cell(r.size.staff, "count"),
        cell(r.size.active_clinicians, "count"),
        cell(r.size.questions, "count"),
      ]),
    };

  if (s.changes.status === "ok") {
    // The latest week against the month before it, per day: two periods,
    // each its own figure, never a total.
    const compared = windowText(s.changes.window);
    tables.changes = {
      header: [
        "Compared",
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
          compared,
          c.hospital?.name ?? "All hospitals",
          AREA_TITLE[c.area],
          measureLabel(c.measure),
          DIRECTION_WORD[c.direction],
          c.serious ? "Yes" : "No",
          cell(c.previous, k),
          cell(c.current, k),
          c.summary,
          c.follow_up?.by.name ?? null,
          c.follow_up ? day(c.follow_up.at) : null,
        ];
      }),
    };
  }
  for (const k of ["use", "quality", "hospitals"] as const) {
    const t = tables[k];
    if (t) tables[k] = withPeriod(t);
  }

  const out: Cell[][] = [];
  for (const k of AREAS) {
    out.push([], [AREA_TITLE[k]]);
    const t = tables[k];
    const note = notes[k];
    if (t) out.push(t.header, ...t.rows);
    else out.push([note ?? CSV_FAILED]);
  }
  // The whole file stops at CSV_MAX_ROWS lines (the first one included).
  // Only the changes list can be long, so it's what is cut: every area is
  // still written, and the last line says the file stopped.
  const over = out.length + 1 - CSV_MAX_ROWS;
  if (over > 0 && tables.changes) {
    const at = out.findIndex((r) => r === tables.changes!.header);
    const keep = Math.max(0, tables.changes.rows.length - over);
    out.splice(at + 1 + keep, tables.changes.rows.length - keep);
    out.push([], [`Stopped at ${CSV_MAX_ROWS} rows`]);
  }
  return toCsv(
    ["Analytics", PERIOD_PICK[period], named || "No period published yet"],
    out,
  );
}

/** "analytics-last-month-2026-11-11.csv". */
export const analyticsCsvName = (period: Period, now: number) =>
  `analytics-${PERIOD_PICK[period].toLowerCase().replace(/ /g, "-")}-${new Date(now).toISOString().slice(0, 10)}.csv`;
