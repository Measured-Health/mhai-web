// Each Analysis view's tables, built once for the screen's Table view and
// for the CSV, so the two can't drift (spec §5.2: the file is exactly the
// view on screen). A cell is words, or a guarded figure that both read
// through the same wording: hidden rates and shares "Not shown", hidden
// counts "Fewer than 5", too few hospitals in its own words. No hidden
// value is ever worked out from others, and no order shows a hidden size.
import type { GuardKind } from "@mhai/ui/guards";
import { isSmallCount } from "@mhai/ui/small-groups";
import type {
  AGuarded,
  CoOccurringData,
  ConditionRef,
  DataOf,
  FindingsData,
  HospitalRow,
  Meta,
  PrevalenceData,
  QualityData,
  Setting,
  Share,
  ViewId,
} from "../api/analysis-contract";
import {
  AGE_LABEL,
  COVERAGE_LABEL,
  KIND_LABEL,
  NOT_ENOUGH_PEERS,
  NOT_STANDARDISED,
  PARTLY_STANDARDISED,
  SEVERITIES,
  SEVERITY_LABEL,
  SEX_LABEL,
  ageText,
  conditionText,
  flagText,
  headlineText,
  locationText,
  monthLabel,
  settingText,
  specialtyText,
  valueText,
  withCount,
} from "./labels";

/** A table cell: words, or a guarded figure. */
export type Fig = string | { g: AGuarded; kind: GuardKind };
export type TableColumn = { key: string; label: string; numeric?: boolean };
export type TableSpec = {
  caption: string;
  columns: TableColumn[];
  rows: { id: string; cells: Record<string, Fig> }[];
};
type Read<V extends ViewId> = Meta & { data: DataOf[V] };

/** A cell as the screen writes it. */
export const figText = (f: Fig): string =>
  typeof f === "string" ? f : valueText(f.g, f.kind);

// ---- order ------------------------------------------------------------------

/** A number that shows; null when hidden or empty. */
export const shownValue = (g: AGuarded): number | null =>
  g.suppressed || g.value === null ? null : g.value;
/** A count that reads as a number; null when it reads in words (1–4 too). */
export const countValue = (g: AGuarded): number | null => {
  const n = shownValue(g);
  return n === null || isSmallCount(n) ? null : n;
};
/**
 * Largest shown first; anything not shown after, by name, so a hidden
 * row's place says nothing about its size.
 */
export function byShownThenName<T>(
  rows: readonly T[],
  value: (r: T) => number | null,
  name: (r: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x !== null && y !== null && x !== y) return y - x;
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    return name(a).localeCompare(name(b));
  });
}

const count = (g: AGuarded): Fig => ({ g, kind: "count" });
const rate = (g: AGuarded): Fig => ({ g, kind: "rate" });
const share = (g: AGuarded): Fig => ({ g, kind: "share" });

// ---- Prevalence -------------------------------------------------------------

export const PREVALENCE_RATE = "Cases per 1,000";
export const MONTHS_TITLE = "Cases per 1,000 by month";
export const MEDIAN_LABEL = "Median of similar hospitals";

/** Conditions by shown rate; anything not shown after, by name. */
export const sortConditions = (rows: PrevalenceData["by_condition"]) =>
  byShownThenName(
    rows,
    (c) => shownValue(c.rate.per_1000),
    (c) => conditionText(c.condition),
  );
/** The monthly median shows only beside an available comparison. */
export const withMedian = (d: Read<"prevalence">) =>
  d.scope === "hospital" && d.comparison !== null && d.comparison.available;

function prevalenceTables(d: Read<"prevalence">): TableSpec[] {
  const median = withMedian(d);
  return [
    {
      caption: MONTHS_TITLE,
      columns: [
        { key: "month", label: "Month" },
        { key: "cases", label: "Cases", numeric: true },
        { key: "seen", label: "Patients seen", numeric: true },
        { key: "rate", label: PREVALENCE_RATE, numeric: true },
        ...(median
          ? [{ key: "median", label: MEDIAN_LABEL, numeric: true }]
          : []),
      ],
      rows: d.data.series.map((s) => ({
        id: s.month,
        cells: {
          month: monthLabel(s.month),
          cases: count(s.rate.count),
          seen: count(s.rate.base),
          rate: rate(s.rate.per_1000),
          ...(median
            ? {
                // A hidden median: too few similar hospitals that month.
                median: !s.median
                  ? ""
                  : s.median.suppressed
                    ? NOT_ENOUGH_PEERS
                    : rate(s.median),
              }
            : {}),
        },
      })),
    },
    {
      caption: "By condition",
      columns: [
        { key: "condition", label: "Condition" },
        { key: "icd10", label: "ICD-10" },
        { key: "cases", label: "Cases", numeric: true },
        { key: "rate", label: PREVALENCE_RATE, numeric: true },
        { key: "new", label: "New", numeric: true },
      ],
      rows: sortConditions(d.data.by_condition).map((c) => ({
        id: c.condition.id,
        cells: {
          condition: c.condition.name ?? NOT_STANDARDISED,
          icd10: c.condition.icd10 ?? "No code",
          cases: count(c.cases),
          rate: rate(c.rate.per_1000),
          new: count(c.new),
        },
      })),
    },
  ];
}

// ---- Who is affected --------------------------------------------------------

export type AffectedGroup = { key: string; label: string } & Share;
export type AffectedSet = {
  title: string;
  head: string;
  rows: AffectedGroup[];
};

const AGE_ORDER = Object.keys(AGE_LABEL);
const SEX_ORDER = ["female", "male", "other", "not_recorded"];
const SETTING_ORDER: (Setting | "-")[] = [
  "admitted",
  "outpatient",
  "emergency",
  "-",
];
/** In a fixed order, never by size. */
const inOrder = (order: readonly string[], rows: AffectedGroup[]) =>
  [...rows].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
const byShare = (rows: AffectedGroup[]) =>
  byShownThenName(
    rows,
    (g) => shownValue(g.share),
    (g) => g.label,
  );

/** Age, sex and setting in their own order; specialty and ward by share. */
export function affectedSets(d: Read<"affected">): AffectedSet[] {
  const a = d.data;
  return [
    {
      title: "By age band",
      head: "Age band",
      rows: inOrder(
        AGE_ORDER,
        a.by_age.map((r) => ({ ...r, key: r.band, label: ageText(r.band) })),
      ),
    },
    {
      title: "By sex",
      head: "Sex",
      rows: inOrder(
        SEX_ORDER,
        a.by_sex.map((r) => ({ ...r, key: r.sex, label: SEX_LABEL[r.sex] })),
      ),
    },
    {
      title: "By setting",
      head: "Setting",
      rows: inOrder(
        SETTING_ORDER,
        a.by_setting.map((r) => ({
          ...r,
          key: r.setting ?? "-",
          label: settingText(r.setting),
        })),
      ),
    },
    {
      title: "By specialty",
      head: "Specialty",
      rows: byShare(
        a.by_specialty.map((r) => ({
          ...r,
          key: r.specialty ?? "-",
          label: specialtyText(r.specialty),
        })),
      ),
    },
    ...(d.scope === "hospital" && a.by_location
      ? [
          {
            title: "By ward or clinic",
            head: "Ward or clinic",
            rows: byShare(
              a.by_location.map((r) => ({
                ...r,
                key: r.location?.id ?? "-",
                label: locationText(r.location),
              })),
            ),
          },
        ]
      : []),
  ];
}
/** "62% · 140", "Not shown · 25", "Not shown · Fewer than 5". */
export const shareText = (s: Share) =>
  withCount(s.share, s.patients, (g) => valueText(g, "share"));

const affectedTables = (d: Read<"affected">): TableSpec[] =>
  affectedSets(d).map((set) => ({
    caption: set.title,
    columns: [
      { key: "group", label: set.head },
      { key: "share", label: "Share", numeric: true },
      { key: "patients", label: "Patients", numeric: true },
    ],
    rows: set.rows.map((r) => ({
      id: r.key,
      cells: {
        group: r.label,
        share: share(r.share),
        patients: count(r.patients),
      },
    })),
  }));

// ---- Co-occurring -----------------------------------------------------------

export const PAIRS_TITLE = "Pairs of conditions";
export const PAIRS_MAX = 20;
type Pair = CoOccurringData["pairs"][number];
const nameOf = (c: ConditionRef) => c.name ?? NOT_STANDARDISED;
/** "Type 2 diabetes + Hypertension". */
export const pairText = (p: Pair) => `${nameOf(p.a)} + ${nameOf(p.b)}`;
export const pairKey = (p: Pair) => `${p.a.id}|${p.b.id}`;
/** "Share of people with Type 2 diabetes". */
export const pairShareLabel = (p: Pair) =>
  `Share of people with ${nameOf(p.a)}`;
/** Shown pairs by patients, then the rest by name; at most 20. */
export const sortPairs = (pairs: readonly Pair[]) =>
  byShownThenName(pairs, (p) => countValue(p.patients), pairText).slice(
    0,
    PAIRS_MAX,
  );

const coOccurringTables = (d: Read<"co-occurring">): TableSpec[] => [
  {
    caption: PAIRS_TITLE,
    columns: [
      { key: "pair", label: "Pair" },
      { key: "patients", label: "Patients", numeric: true },
      { key: "share", label: "Share of people with the first", numeric: true },
    ],
    rows: sortPairs(d.data.pairs).map((p) => ({
      id: pairKey(p),
      cells: {
        pair: pairText(p),
        patients: count(p.patients),
        share: share(p.share_of_a),
      },
    })),
  },
];

// ---- Findings and alerts ----------------------------------------------------

type Finding = FindingsData["findings"][number];
export const findingName = (f: Finding) => f.name ?? NOT_STANDARDISED;
/** "Potassium · High": the flag in words, never by colour alone. */
export const findingText = (f: Finding) =>
  `${findingName(f)} · ${flagText(f.flag)}`;
export const findingKey = (f: Finding) => `${f.name ?? "-"}|${f.flag ?? "-"}`;
export const sortFindings = (rows: readonly Finding[]) =>
  byShownThenName(rows, (f) => countValue(f.patients), findingText);
export const ALERTS_TITLE = "Alerts by severity";
/** "Alerts in all: 1,240". */
export const alertsTotalText = (d: FindingsData) =>
  `Alerts in all: ${valueText(d.alerts.total, "count")}`;

const findingsTables = (d: Read<"findings">): TableSpec[] => [
  {
    caption: "Findings",
    columns: [
      { key: "finding", label: "Finding" },
      { key: "flag", label: "Flag" },
      { key: "patients", label: "Patients", numeric: true },
      { key: "rate", label: "Per 1,000 seen", numeric: true },
    ],
    rows: sortFindings(d.data.findings).map((f) => ({
      id: findingKey(f),
      cells: {
        finding: findingName(f),
        flag: flagText(f.flag),
        patients: count(f.patients),
        rate: rate(f.rate.per_1000),
      },
    })),
  },
  {
    caption: ALERTS_TITLE,
    columns: [
      { key: "severity", label: "Severity" },
      { key: "alerts", label: "Alerts", numeric: true },
    ],
    rows: SEVERITIES.map((k) => ({
      id: k,
      cells: {
        severity: SEVERITY_LABEL[k],
        alerts: count(d.data.alerts.by_severity[k]),
      },
    })),
  },
];

// ---- MHAI quality -----------------------------------------------------------

type QualityRow = QualityData["by_condition"][number];
export const sortQuality = (rows: readonly QualityRow[]) =>
  byShownThenName(
    rows,
    (r) => countValue(r.consultations),
    (r) => conditionText(r.condition),
  );

const qualityTables = (d: Read<"quality">): TableSpec[] => [
  {
    caption: "By condition",
    columns: [
      { key: "condition", label: "Condition" },
      { key: "consultations", label: "Consultations", numeric: true },
      { key: "high", label: "High confidence", numeric: true },
      { key: "medium", label: "Medium confidence", numeric: true },
      { key: "low", label: "Low confidence", numeric: true },
      { key: "rated", label: "Rated", numeric: true },
      { key: "agreed", label: "Reviewers agreed", numeric: true },
      { key: "reviewers", label: "Reviewers", numeric: true },
      { key: "approved", label: "Approved", numeric: true },
      { key: "rejected", label: "Rejected", numeric: true },
      { key: "waiting", label: "Waiting", numeric: true },
    ],
    rows: sortQuality(d.data.by_condition).map((r) => ({
      id: r.condition.id,
      cells: {
        condition: conditionText(r.condition),
        consultations: count(r.consultations),
        high: count(r.confidence.high),
        medium: count(r.confidence.medium),
        low: count(r.confidence.low),
        rated: count(r.rated),
        agreed: share(r.agreement_rate),
        reviewers: count(r.reviewers),
        approved: count(r.corrections.approved),
        rejected: count(r.corrections.rejected),
        waiting: count(r.corrections.waiting),
      },
    })),
  },
];

const TABLES: { [V in ViewId]: (d: Read<V>) => TableSpec[] } = {
  prevalence: prevalenceTables,
  affected: affectedTables,
  "co-occurring": coOccurringTables,
  findings: findingsTables,
  quality: qualityTables,
};

/** A view's tables, in screen order, as the Table view shows them. */
export function viewTables<V extends ViewId>(view: V, d: Read<V>): TableSpec[] {
  return TABLES[view](d);
}

// ---- Hospital rows ----------------------------------------------------------

/** The hospital rows' headline column, per view (Co-occurring has none). */
export const HOSPITAL_HEADLINE: Record<
  ViewId,
  { label: string; kind: "rate" | "share" } | null
> = {
  prevalence: { label: PREVALENCE_RATE, kind: "rate" },
  affected: { label: "Per 1,000 seen", kind: "rate" },
  "co-occurring": null,
  findings: { label: "Abnormal findings per 1,000", kind: "rate" },
  quality: { label: "Reviewers agreed", kind: "share" },
};
export type HospitalKey =
  "hospital" | "size" | "headline" | "kind" | "coverage" | "not_standardised";
export const hospitalColumns = (headlineLabel: string): TableColumn[] => [
  { key: "hospital", label: "Hospital" },
  { key: "size", label: "Patients seen", numeric: true },
  { key: "headline", label: headlineLabel, numeric: true },
  { key: "kind", label: "Kind" },
  { key: "coverage", label: "Coverage" },
  { key: "not_standardised", label: "Not standardised", numeric: true },
];
/** One hospital row's cells, as the screen writes them. */
export const hospitalCells = (
  r: HospitalRow,
  kind: "rate" | "share",
): Record<HospitalKey, string> => ({
  hospital: r.hospital.name,
  size: valueText(r.size, "count"),
  headline: withCount(r.headline.per_1000, r.headline.count, (g) =>
    headlineText(g, kind),
  ),
  kind: KIND_LABEL[r.kind],
  coverage: COVERAGE_LABEL[r.coverage],
  not_standardised: valueText(r.not_standardised_share, "share"),
});
/** The partly standardised sign, in words. */
export const partlyText = (r: HospitalRow) =>
  r.partly_standardised ? PARTLY_STANDARDISED : "";
