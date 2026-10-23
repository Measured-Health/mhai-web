// The platform Analysis CSV (spec §5.2, §6): exactly the read view on
// screen, never more. It starts with the view, the scope (and hospital),
// the months, each active filter by its label, the included hospitals and
// "Sample data" when it is; then the view's tables, then the hospital rows
// (All hospitals) or the comparison lines (One hospital). Hidden values read
// "Fewer than 5" or "Too few hospitals to show". It carries no id, no drill
// key and no patient field.
import { CSV_MAX_ROWS, toCsv, type Cell } from "@mhai/ui/csv";
import type { GuardKind } from "@mhai/ui/guards";
import type {
  AGuarded,
  AnalysisQuery,
  AnalysisStatus,
  DataOf,
  FilterOptionsOut,
  Meta,
  Rate,
  ViewId,
} from "../api/analysis-contract";
import {
  COVERAGE_LABEL,
  KIND_LABEL,
  SAMPLE_DATA,
  SCOPE_LABEL,
  SEX_LABEL,
  SETTING_LABEL,
  VIEW_TITLE,
  ageText,
  comparisonLines,
  conditionText,
  hiddenText,
  includedText,
  locationText,
  monthLabel,
  monthsText,
  periodLabel,
  settingText,
  specialtyText,
} from "./labels";

export type CsvContext = {
  status: AnalysisStatus;
  options: FilterOptionsOut | null;
  /** The query the view answers: its filters go in the header, by label. */
  query: AnalysisQuery;
};

type Row = Cell[];
type Read<V extends ViewId> = Meta & { data: DataOf[V] };

const NOT_LISTED = "Not listed";

/**
 * A cell: hidden reads in words; a count as a number, a rate per 1,000 to
 * one place, a share as a whole percentage; nothing to measure is empty.
 */
function cell(g: AGuarded, kind: GuardKind): Cell {
  const hidden = hiddenText(g, kind);
  if (hidden) return hidden;
  if (g.value === null || !Number.isFinite(g.value)) return null;
  if (kind === "share") return Math.round(g.value * 100);
  if (kind === "rate") return Math.round(g.value * 10) / 10;
  return Math.round(g.value);
}
const num = (g: AGuarded) => cell(g, "count");
const per = (g: AGuarded) => cell(g, "rate");
const pct = (g: AGuarded) => cell(g, "share");

/** What a view's headline counts, over what, and as what. */
const HEADLINE: Record<ViewId, [count: string, base: string, rate: string]> = {
  prevalence: [
    "Patients with a condition in scope",
    "Patients seen",
    "Per 1,000 seen",
  ],
  affected: [
    "Patients with a condition in scope",
    "Patients seen",
    "Per 1,000 seen",
  ],
  "co-occurring": [
    "Patients with a condition in scope",
    "Patients seen",
    "Per 1,000 seen",
  ],
  findings: [
    "Patients with a flagged finding",
    "Patients seen",
    "Per 1,000 seen",
  ],
  quality: ["Ratings agreed with", "Ratings", "Agreement rate (%)"],
};
/** Quality's headline is a percentage (per 1,000 ÷ 10). */
const headlineRate = (view: ViewId, g: AGuarded): Cell =>
  view === "quality"
    ? cell(g.value === null ? g : { ...g, value: g.value / 1000 }, "share")
    : per(g);

/** Each active filter, by its label; never an id. */
function filterRows(q: AnalysisQuery, o: FilterOptionsOut | null): Row[] {
  const out: Row[] = [];
  if (q.condition !== null) {
    const c = o?.conditions.find((x) => x.id === q.condition);
    out.push(["Condition", c ? conditionText(c) : NOT_LISTED]);
  }
  if (q.age_band !== null) out.push(["Age band", ageText(q.age_band)]);
  if (q.sex !== null) out.push(["Sex", SEX_LABEL[q.sex] ?? NOT_LISTED]);
  if (q.setting !== null)
    out.push(["Setting", SETTING_LABEL[q.setting] ?? NOT_LISTED]);
  if (q.specialty !== null) {
    const known = o?.specialties.includes(q.specialty);
    out.push(["Specialty", known ? q.specialty : NOT_LISTED]);
  }
  if (q.location !== null) {
    const l = o?.locations.find((x) => x.id === q.location);
    out.push(["Ward or clinic", l ? locationText(l) : NOT_LISTED]);
  }
  if (q.source !== null) {
    const s = o?.sources.find((x) => x.id === q.source);
    out.push(["Source", s ? s.label : NOT_LISTED]);
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
const shareTable = (title: string, group: string, rows: Row[]) =>
  table(title, [group, "Patients", "Share (%)"], rows);
const rateCells = (r: Rate): Row => [
  num(r.count),
  num(r.base),
  per(r.per_1000),
];

const TABLES: { [V in ViewId]: (d: Read<V>) => Row[] } = {
  prevalence: (d) => [
    ...table(
      "By condition",
      [
        "Condition",
        "Cases",
        "Patients seen",
        "Per 1,000 seen",
        "New in this period",
      ],
      d.data.by_condition.map((r) => [
        conditionText(r.condition),
        num(r.cases),
        num(r.rate.base),
        per(r.rate.per_1000),
        num(r.new),
      ]),
    ),
    ...table(
      "By month",
      [
        "Month",
        "Patients with a condition in scope",
        "Patients seen",
        "Per 1,000 seen",
        ...(d.scope === "hospital" ? ["Median of similar hospitals"] : []),
      ],
      d.data.series.map((p) => [
        monthLabel(p.month),
        ...rateCells(p.rate),
        ...(d.scope === "hospital" ? [p.median ? per(p.median) : null] : []),
      ]),
    ),
  ],

  affected: (d) => [
    ...shareTable(
      "By age band",
      "Age band",
      d.data.by_age.map((r) => [
        ageText(r.band),
        num(r.patients),
        pct(r.share),
      ]),
    ),
    ...shareTable(
      "By sex",
      "Sex",
      d.data.by_sex.map((r) => [
        SEX_LABEL[r.sex],
        num(r.patients),
        pct(r.share),
      ]),
    ),
    ...shareTable(
      "By setting",
      "Setting",
      d.data.by_setting.map((r) => [
        settingText(r.setting),
        num(r.patients),
        pct(r.share),
      ]),
    ),
    ...shareTable(
      "By specialty",
      "Specialty",
      d.data.by_specialty.map((r) => [
        specialtyText(r.specialty),
        num(r.patients),
        pct(r.share),
      ]),
    ),
    ...(d.data.by_location
      ? shareTable(
          "By ward or clinic",
          "Ward or clinic",
          d.data.by_location.map((r) => [
            locationText(r.location),
            num(r.patients),
            pct(r.share),
          ]),
        )
      : []),
  ],

  "co-occurring": (d) =>
    table(
      "Pairs of conditions",
      ["Condition", "With", "Patients", "Share of the first condition (%)"],
      d.data.pairs.map((p) => [
        conditionText(p.a),
        conditionText(p.b),
        num(p.patients),
        pct(p.share_of_a),
      ]),
    ),

  findings: (d) => [
    ...table(
      "Findings",
      ["Finding", "Flag", "Patients", "Per 1,000 seen"],
      d.data.findings.map((f) => [
        f.name ?? "Not named",
        f.flag === null
          ? null
          : { high: "High", low: "Low", abnormal: "Abnormal" }[f.flag],
        num(f.patients),
        per(f.rate.per_1000),
      ]),
    ),
    ...table(
      "Alerts",
      ["Alerts", "Critical", "Urgent", "Info"],
      [
        [
          num(d.data.alerts.total),
          num(d.data.alerts.by_severity.critical),
          num(d.data.alerts.by_severity.urgent),
          num(d.data.alerts.by_severity.info),
        ],
      ],
    ),
  ],

  quality: (d) =>
    table(
      "By condition",
      [
        "Condition",
        "Consultations",
        "High confidence",
        "Medium confidence",
        "Low confidence",
        "Rated",
        "Reviewers agreed (%)",
        "Reviewers",
        "Corrections",
        "Approved",
        "Rejected",
        "Waiting",
      ],
      d.data.by_condition.map((r) => [
        conditionText(r.condition),
        num(r.consultations),
        num(r.confidence.high),
        num(r.confidence.medium),
        num(r.confidence.low),
        num(r.rated),
        pct(r.agreement_rate),
        num(r.reviewers),
        num(r.corrections.total),
        num(r.corrections.approved),
        num(r.corrections.rejected),
        num(r.corrections.waiting),
      ]),
    ),
};

/** The all-hospitals rows: size, the headline with its count, kind, coverage. */
function hospitalRows<V extends ViewId>(view: V, d: Read<V>): Row[] {
  const [countLabel, , rateLabel] = HEADLINE[view];
  return table(
    "By hospital",
    [
      "Hospital",
      "Patients seen",
      countLabel,
      rateLabel,
      "Kind",
      "Coverage",
      "Not standardised (%)",
      "Partly standardised",
    ],
    (d.hospitals ?? []).map((r) => [
      r.hospital.name,
      num(r.size),
      num(r.headline.count),
      headlineRate(view, r.headline.per_1000),
      KIND_LABEL[r.kind],
      COVERAGE_LABEL[r.coverage],
      pct(r.not_standardised_share),
      r.partly_standardised ? "Yes" : "No",
    ]),
  );
}

/** The comparison, in the panel's order: context, last period, median, verdict. */
function comparisonRows<V extends ViewId>(view: V, d: Read<V>): Row[] {
  if (!d.comparison) return [];
  const l = comparisonLines(
    d.comparison,
    view === "quality" ? "share" : "rate",
  );
  const lines = [l.context, l.previous, l.median, l.verdict, l.reason].filter(
    (x): x is string => x !== null,
  );
  return [["Compared with similar hospitals"], ...lines.map((x) => [x]), []];
}

/** The file for one read view; see the file comment. */
export function analysisCsv<V extends ViewId>(
  view: V,
  data: Read<V>,
  ctx: CsvContext,
): string {
  const [countLabel, baseLabel, rateLabel] = HEADLINE[view];
  const head: Row[] = [
    ["Scope", SCOPE_LABEL[data.scope]],
    ...(data.scope === "hospital" && data.hospital
      ? [["Hospital", data.hospital.name]]
      : []),
    ["Months", monthsText(data.period)],
    ["Period", periodLabel(ctx.query.period)],
    ...filterRows(ctx.query, ctx.options),
    ["Hospitals", includedText(ctx.status)],
    ...(ctx.status.sample ? [[SAMPLE_DATA]] : []),
    [],
  ];
  const body: Row[] = [
    ...table(
      "Headline",
      ["Patients in the group", countLabel, baseLabel, rateLabel],
      [
        [
          num(data.patients),
          num(data.headline.count),
          num(data.headline.base),
          headlineRate(view, data.headline.per_1000),
        ],
      ],
    ),
    ...TABLES[view](data),
    ...(data.scope === "all"
      ? hospitalRows(view, data)
      : comparisonRows(view, data)),
  ];
  return toCsv([VIEW_TITLE[view]], [...head, ...body].slice(0, CSV_MAX_ROWS));
}

/** A file-name part: lower case, letters and digits joined by hyphens. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * "mhai-analysis-all-hospitals-prevalence-12m.csv", or the hospital's name
 * for one hospital. Never a filter.
 */
export function analysisCsvName(
  view: ViewId,
  q: AnalysisQuery,
  hospitalName: string | null,
): string {
  const scope =
    q.scope === "all"
      ? "all-hospitals"
      : slug(hospitalName ?? "") || "one-hospital";
  return `mhai-analysis-${scope}-${view}-${q.period}.csv`;
}
