// The Analysis CSV: aggregates only (spec §6). It lists the view, the
// hospital, the period and each active filter by its label, then the
// view's tables. Hidden values read "Fewer than 5". It never carries a
// patient row, a pseudonymous ID or a drill key.
import { CSV_MAX_ROWS, toCsv, type Cell } from "@mhai/ui/csv";
import { FEWER_THAN_5 } from "@mhai/ui/small-groups";
import type { ConfidenceLevel, GuardedOut } from "../api/admin-contract";
import type {
  AnalysisFilters,
  FilterOptionsOut,
  ViewId,
  ViewOut,
} from "../api/analysis-contract";
import { RESULT_LABEL } from "../labels";
import {
  SEVERITY,
  dismissReasonLabel,
  flagWord,
} from "../notifications/alert-view";
import {
  AGE_LABEL,
  SETTING_LABEL,
  SEX_LABEL,
  NOT_STANDARDISED,
  VIEW_TITLE,
  conditionText,
  locationText,
  settingText,
  specialtyText,
} from "./labels";

export type CsvContext = {
  hospital: string;
  filters: AnalysisFilters;
  options: FilterOptionsOut | null;
};

type Row = Cell[];
const NOTE = "Groups of fewer than 5 are hidden.";
const LEVELS: readonly ConfidenceLevel[] = [
  "high",
  "caution",
  "review",
  "failed",
];
const SEVERITIES = ["critical", "urgent", "info"] as const;

/** A count as a number, or "Fewer than 5"; nothing to measure is empty. */
const num = (g: GuardedOut): Cell => (g.suppressed ? FEWER_THAN_5 : g.value);
const pct = (g: GuardedOut): Cell =>
  g.suppressed
    ? FEWER_THAN_5
    : g.value === null
      ? null
      : `${Math.round(g.value * 100)}%`;

/** Each active filter, by its label. An option no longer listed keeps its id. */
function filterRows(f: AnalysisFilters, o: FilterOptionsOut | null): Row[] {
  const out: Row[] = [];
  if (f.condition !== null) {
    const c = o?.conditions.find((x) => x.id === f.condition);
    out.push(["Condition", c ? conditionText(c) : f.condition]);
  }
  if (f.age_band !== null) out.push(["Age band", AGE_LABEL[f.age_band]]);
  if (f.sex !== null) out.push(["Sex", SEX_LABEL[f.sex]]);
  if (f.location !== null) {
    const l = o?.locations.find((x) => x.id === f.location);
    out.push(["Ward or clinic", l ? locationText(l) : f.location]);
  }
  if (f.setting !== null) out.push(["Location type", SETTING_LABEL[f.setting]]);
  if (f.specialty !== null) out.push(["Specialty", f.specialty]);
  if (f.source !== null) {
    const s = o?.sources.find((x) => x.id === f.source);
    out.push(["Source", s ? s.label : f.source]);
  }
  return out;
}

/** A titled table, then a blank line. */
const table = (title: string, header: string[], rows: Row[]): Row[] => [
  [title],
  header,
  ...rows,
  [],
];

const TABLES: { [V in ViewId]: (d: ViewOut[V]) => Row[] } = {
  prevalence: (d) => [
    ...table(
      "Totals",
      ["Cases", "New in this period", "Existing"],
      [[num(d.total.cases), num(d.total.new), num(d.total.existing)]],
    ),
    ...table(
      "By condition",
      ["Condition", "Cases", "New in this period", "Existing"],
      d.by_condition.map((r) => [
        conditionText(r.condition),
        num(r.cases),
        num(r.new),
        num(r.existing),
      ]),
    ),
    ...table(
      "Over time",
      [
        d.bucket === "week" ? "Week starting" : "Month starting",
        "Cases",
        "New in this period",
      ],
      d.series.map((p) => [p.start, num(p.cases), num(p.new)]),
    ),
  ],

  affected: (d) => [
    ["Patients", num(d.patients)],
    [],
    ...table(
      "By age band",
      ["Age band", "Patients"],
      d.by_age.map((r) => [AGE_LABEL[r.band], num(r.patients)]),
    ),
    ...table(
      "By sex",
      ["Sex", "Patients"],
      d.by_sex.map((r) => [SEX_LABEL[r.sex], num(r.patients)]),
    ),
    ...table(
      "By location type",
      ["Location type", "Patients"],
      d.by_setting.map((r) => [settingText(r.setting), num(r.patients)]),
    ),
    ...table(
      "By ward or clinic",
      ["Ward or clinic", "Patients"],
      d.by_location.map((r) => [locationText(r.location), num(r.patients)]),
    ),
    ...table(
      "By specialty",
      ["Specialty", "Patients"],
      d.by_specialty.map((r) => [specialtyText(r.specialty), num(r.patients)]),
    ),
  ],

  "co-occurring": (d) =>
    table(
      "Conditions found together",
      [
        "Condition A",
        "Condition B",
        "Patients with A",
        "Patients with both",
        "Share of A",
      ],
      d.pairs.map((r) => [
        conditionText(r.a),
        conditionText(r.b),
        num(r.a_patients),
        num(r.patients),
        pct(r.share_of_a),
      ]),
    ),

  findings: (d) => {
    const a = d.alerts;
    return [
      ...table(
        "Findings",
        ["Finding", "Flag", "Patients", "Results"],
        d.findings.map((r) => [
          r.name ?? NOT_STANDARDISED,
          flagWord(r.flag),
          num(r.patients),
          num(r.results),
        ]),
      ),
      ...table(
        "Alerts",
        ["Severity", "Alerts"],
        [
          ...SEVERITIES.map((s) => [SEVERITY[s].label, num(a.by_severity[s])]),
          ["All alerts", num(a.total)],
        ],
      ),
      ...table(
        "Time to acknowledge",
        ["Alerts", "Median minutes"],
        [
          ["All alerts", num(a.median_ack_minutes)],
          ["Critical", num(a.critical_median_ack_minutes)],
        ],
      ),
      ...table(
        "Dismissed alerts",
        ["Reason", "Alerts"],
        [
          ...a.dismiss_reasons.map((r) => [
            dismissReasonLabel(r.reason),
            num(r.count),
          ]),
          ["All dismissed", num(a.dismissed)],
        ],
      ),
    ];
  },

  quality: (d) =>
    table(
      "By condition",
      [
        "Condition",
        "Consultations",
        ...LEVELS.map((l) => RESULT_LABEL[l]),
        "Rated",
        "Clinicians agreed",
        "Corrections",
        "Approved",
        "Rejected",
        "Waiting",
      ],
      d.by_condition.map((r) => [
        conditionText(r.condition),
        num(r.consultations),
        ...LEVELS.map((l) => num(r.confidence[l])),
        num(r.rated),
        pct(r.agreement_rate),
        num(r.corrections.total),
        num(r.corrections.approved),
        num(r.corrections.rejected),
        num(r.corrections.waiting),
      ]),
    ),
};

/** The view's CSV, at most CSV_MAX_ROWS rows after the header. */
export function analysisCsv<V extends ViewId>(
  view: V,
  data: ViewOut[V],
  ctx: CsvContext,
): string {
  const rows: Row[] = [
    ["Hospital", ctx.hospital],
    ["Period", `${ctx.filters.from} to ${ctx.filters.to}`],
    ...filterRows(ctx.filters, ctx.options),
    ["Note", NOTE],
    [],
    ...(TABLES[view] as (d: ViewOut[V]) => Row[])(data),
  ];
  return toCsv(["Analysis", VIEW_TITLE[view]], rows.slice(0, CSV_MAX_ROWS));
}

/** "mhai-analysis-prevalence-2026-07-24-to-2026-10-22.csv". */
export const csvFilename = (view: ViewId, f: AnalysisFilters) =>
  `mhai-analysis-${view}-${f.from}-to-${f.to}.csv`;
