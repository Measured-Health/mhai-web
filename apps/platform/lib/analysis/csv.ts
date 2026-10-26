// The platform Analysis CSV (spec §5.2, §6): exactly the read view on
// screen, never more. It starts with the view, the scope (and hospital),
// the months, each active filter by its label, the included hospitals and
// "Sample data" when it is; then the headline and the view's tables, built
// by `tables.ts` exactly as the Table view shows them, then the hospital
// rows (All hospitals) or the comparison as the panel shows it (One
// hospital). Every word is the screen's: hidden counts "Fewer than 5",
// hidden rates and shares "Not shown", "Too few hospitals to show". It
// carries no id, no drill key and no patient field.
import { CSV_MAX_ROWS, toCsv, type Cell } from "@mhai/ui/csv";
import type {
  AGuarded,
  AnalysisQuery,
  AnalysisStatus,
  DataOf,
  FilterOptionsOut,
  Meta,
  ViewId,
} from "../api/analysis-contract";
import {
  PARTLY_STANDARDISED,
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
  monthsText,
  periodLabel,
} from "./labels";
import {
  HOSPITAL_HEADLINE,
  alertsTotalText,
  figText,
  hospitalCells,
  hospitalColumns,
  partlyText,
  viewTables,
  type Fig,
  type HospitalKey,
  type TableSpec,
} from "./tables";

export type CsvContext = {
  status: AnalysisStatus;
  options: FilterOptionsOut | null;
};
/**
 * A view as read: the reply and the query it answers (from `readView`). The
 * header's filters come from that query, never from the screen's current
 * one, so a file made while a view refetches labels its figures truly.
 */
export type CsvView<V extends ViewId> = {
  data: Meta & { data: DataOf[V] };
  query: AnalysisQuery;
};

type Row = Cell[];
type Read<V extends ViewId> = Meta & { data: DataOf[V] };

const NOT_LISTED = "Not listed";

/**
 * A cell in the screen's words: hidden values and "No data yet" read as on
 * screen; a count as a number, a rate per 1,000 to one place and a share as
 * a whole percentage, rounded as the screen rounds them.
 */
export function figCell(f: Fig): Cell {
  if (typeof f === "string") return f;
  const { g, kind } = f;
  if (hiddenText(g, kind) || g.value === null || !Number.isFinite(g.value))
    return figText(f);
  if (kind === "share") return Math.round(g.value * 100);
  if (kind === "rate") return Math.round(g.value * 10) / 10;
  return Math.round(g.value);
}
const num = (g: AGuarded) => figCell({ g, kind: "count" });

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
  quality: ["Ratings agreed with", "Ratings", "Reviewers agreed"],
};
/** Quality's headline is a percentage (per 1,000 ÷ 1,000 as a share). */
const headlineRate = (view: ViewId, g: AGuarded): Cell =>
  view === "quality"
    ? figCell({
        g: g.value === null ? g : { ...g, value: g.value / 1000 },
        kind: "share",
      })
    : figCell({ g, kind: "rate" });

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
/** A table exactly as the Table view shows it. */
const specRows = (t: TableSpec): Row[] =>
  table(
    t.caption,
    t.columns.map((c) => c.label),
    t.rows.map((r) => t.columns.map((c) => figCell(r.cells[c.key] ?? ""))),
  );

/** Any line the view shows beside its tables (Findings: alerts in all). */
function extraRows<V extends ViewId>(view: V, d: Read<V>): Row[] {
  if (view !== "findings") return [];
  return [[alertsTotalText((d as Read<"findings">).data)], []];
}

/** The hospital rows, as the screen's table, in its starting (name) order. */
function hospitalRows<V extends ViewId>(view: V, d: Read<V>): Row[] {
  const h = HOSPITAL_HEADLINE[view];
  if (!h || !d.hospitals) return [];
  const columns = hospitalColumns(h.label);
  return table(
    "By hospital",
    [...columns.map((c) => c.label), PARTLY_STANDARDISED],
    [...d.hospitals]
      .sort((a, b) => a.hospital.name.localeCompare(b.hospital.name))
      .map((r) => {
        // The screen's words; its plain numbers as numbers.
        const c: Record<HospitalKey, Cell> = {
          ...hospitalCells(r, h.kind),
          size: figCell({ g: r.size, kind: "count" }),
          not_standardised: figCell({
            g: r.not_standardised_share,
            kind: "share",
          }),
        };
        return [
          ...columns.map((col) => c[col.key as HospitalKey]),
          partlyText(r),
        ];
      }),
  );
}

/**
 * The comparison, as the panel shows it: the context, then the last period,
 * the median and the verdict; or, when not available, only the reason.
 */
function comparisonRows<V extends ViewId>(view: V, d: Read<V>): Row[] {
  const c = d.comparison;
  if (!c || !COMPARED.has(view)) return [];
  const l = comparisonLines(c, view === "quality" ? "share" : "rate");
  const lines = c.available
    ? [l.context, l.previous, l.median, l.verdict]
    : [l.context, l.reason];
  return [
    ["Compared with similar hospitals"],
    ...lines.filter((x): x is string => x !== null).map((x) => [x]),
    [],
  ];
}
/** The views with a fair comparison (spec §5.3). */
const COMPARED = new Set<ViewId>(["prevalence", "findings", "quality"]);

/** The file for one read view; see the file comment. */
export function analysisCsv<V extends ViewId>(
  view: V,
  read: CsvView<V>,
  ctx: CsvContext,
): string {
  const { data, query } = read;
  const [countLabel, baseLabel, rateLabel] = HEADLINE[view];
  const head: Row[] = [
    ["Scope", SCOPE_LABEL[data.scope]],
    ...(data.scope === "hospital" && data.hospital
      ? [["Hospital", data.hospital.name]]
      : []),
    ["Months", monthsText(data.period)],
    ["Period", periodLabel(query.period)],
    ...filterRows(query, ctx.options),
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
    ...viewTables(view, data).flatMap(specRows),
    ...extraRows(view, data),
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
