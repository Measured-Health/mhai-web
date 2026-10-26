// The platform Analysis wording (spec §4, §5): view titles, periods, groups,
// conditions, hospitals and numbers under the small-group rule. A hidden
// value reads "Fewer than 5", or "Too few hospitals to show" when it is an
// all-hospitals figure from fewer than 3 hospitals. 0 reads "0".
import type { GuardKind } from "@mhai/ui/guards";
import { FEWER_THAN_5, isSmallCount } from "@mhai/ui/small-groups";
import type {
  AGuarded,
  AllAgeBand,
  AnalysisPeriod,
  AnalysisStatus,
  Comparison,
  ComparisonReason,
  ConditionRef,
  Coverage,
  HospitalAgeBand,
  HospitalKind,
  LocationRef,
  ScopeKind,
  Setting,
  Sex,
  ViewId,
} from "../api/analysis-contract";
import { MONTHS } from "../format";

export const TOO_FEW_HOSPITALS = "Too few hospitals to show";
export const NOT_STANDARDISED = "Not standardised";
export const PARTLY_STANDARDISED = "Partly standardised";
export const LOCATION_NOT_RECORDED = "Location not recorded";
export const SPECIALTY_NOT_RECORDED = "Specialty not recorded";
export const SETTING_NOT_RECORDED = "Setting not recorded";
export const NO_DATA = "No data yet";
export const NO_EARLIER_DATA = "No earlier data";
/** A hidden monthly median: too few similar hospitals showed that month. */
export const NOT_ENOUGH_PEERS = "Not enough similar hospitals";
export const NO_PATIENTS = "No patients match these filters";
export const SAMPLE_DATA = "Sample data";
export const FILTERS_CLEARED = "Filters cleared for the new scope";

/** In page order. */
export const VIEWS: readonly ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
export const VIEW_TITLE: Record<ViewId, string> = {
  prevalence: "Prevalence and trends",
  affected: "Who is affected",
  "co-occurring": "Co-occurring conditions",
  findings: "Findings and alerts",
  quality: "MHAI quality",
};

/** "Couldn't load who is affected"; a leading acronym keeps its case ("MHAI quality"). */
export function failedText(view: ViewId): string {
  const title = VIEW_TITLE[view];
  const first = title.split(" ")[0];
  const lower =
    first === first.toUpperCase()
      ? title
      : title[0].toLowerCase() + title.slice(1);
  return `Couldn't load ${lower}`;
}

export const SCOPE_LABEL: Record<ScopeKind, string> = {
  all: "All hospitals",
  hospital: "One hospital",
};
const PERIOD_LABEL: Record<AnalysisPeriod, string> = {
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
};
export const periodLabel = (p: AnalysisPeriod) => PERIOD_LABEL[p];

const monthOf = (day: string) => {
  const [y, m] = day.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
/** "Oct 2025 to Sep 2026": the whole months the figures cover. */
export const monthsText = (period: { from: string; to: string }) =>
  `${monthOf(period.from)} to ${monthOf(period.to)}`;
/** "Sep 2026", from a series point's "YYYY-MM". */
export const monthLabel = (month: string) => monthOf(`${month}-01`);

export const AGE_LABEL: Record<AllAgeBand | HospitalAgeBand, string> = {
  "0-19": "0–19",
  "20-39": "20–39",
  "40-59": "40–59",
  "60-79": "60–79",
  "0-17": "0–17",
  "18-39": "18–39",
  "40-64": "40–64",
  "65-79": "65–79",
  "80+": "80 and over",
};
/** An age band the reader passed; one it doesn't know shows as sent. */
export const ageText = (band: string) =>
  (AGE_LABEL as Record<string, string>)[band] ?? band;
export const SEX_LABEL: Record<Sex, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  not_recorded: "Not recorded",
};
export const SETTING_LABEL: Record<Setting, string> = {
  admitted: "Admitted",
  outpatient: "Outpatient",
  emergency: "Emergency",
};
export const settingText = (s: Setting | null) =>
  s ? SETTING_LABEL[s] : SETTING_NOT_RECORDED;
export const specialtyText = (s: string | null) => s ?? SPECIALTY_NOT_RECORDED;

/** "Type 2 diabetes · E11", "Asthma", or "Not standardised". */
export const conditionText = (c: ConditionRef) =>
  c.name === null
    ? NOT_STANDARDISED
    : c.icd10
      ? `${c.name} · ${c.icd10}`
      : c.name;
export const locationText = (l: LocationRef | null) =>
  l ? l.label : LOCATION_NOT_RECORDED;

export const KIND_LABEL: Record<HospitalKind, string> = {
  general: "General hospital",
  specialist: "Specialist hospital",
  teaching: "Teaching hospital",
};
export const COVERAGE_LABEL: Record<Coverage, string> = {
  consultations: "MHAI consultations only",
  consultations_and_records: "Consultations and connected records",
};
export const EXCLUDED_TEXT: Record<
  AnalysisStatus["hospitals"]["excluded"][number]["reason"],
  string
> = {
  not_covered: "Not covered by its agreement",
  not_enough_data: "Not enough data yet",
};

/** "10 of 12 hospitals included". */
export const includedText = (s: AnalysisStatus) =>
  `${s.hospitals.included} of ${s.hospitals.total} hospitals included`;

// ---- Numbers ----------------------------------------------------------------

/** "1,234", grouped the same in every locale. */
const grouped = (n: number) => {
  const [whole, frac] = String(n).split(".");
  const g = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${g}.${frac}` : g;
};
/** To one place, ".0" dropped: 12.4, 12, 1,234.6. */
const oneDecimal = (n: number) => grouped(Math.round(n * 10) / 10);

/** Hidden: too few hospitals, or fewer than 5 (a shown 1–4 count too). */
export function hiddenText(g: AGuarded, kind: GuardKind): string | null {
  if (g.suppressed)
    return g.why === "too_few_hospitals" ? TOO_FEW_HOSPITALS : FEWER_THAN_5;
  if (kind === "count" && g.value !== null && isSmallCount(g.value))
    return FEWER_THAN_5;
  return null;
}

/**
 * A guarded value in words: "Too few hospitals to show", "Fewer than 5",
 * "2,140", "12.4 per 1,000" (a rate is per 1,000), "62%" (a share of 0 to
 * 1), or "No data yet" for nothing to measure.
 */
export function valueText(g: AGuarded, kind: GuardKind): string {
  const hidden = hiddenText(g, kind);
  if (hidden) return hidden;
  if (g.value === null || !Number.isFinite(g.value)) return NO_DATA;
  switch (kind) {
    case "count":
      return grouped(Math.round(g.value));
    case "rate":
      return `${oneDecimal(g.value)} per 1,000`;
    case "share":
      return `${Math.round(g.value * 100)}%`;
    case "minutes":
      return `${Math.round(g.value)} min`;
    case "hours":
      return `${oneDecimal(g.value)} h`;
  }
}

/** A hidden rate or share beside a count that shows: "Not shown · 25". */
export const NOT_SHOWN = "Not shown";

/** A count that reads as a number: shown, not 1–4, not empty. */
export const countShows = (c: AGuarded) =>
  !c.suppressed && c.value !== null && !isSmallCount(c.value);

/**
 * "Not shown" for a rate or share hidden by the small-group rule beside a
 * count that shows; null otherwise. "Fewer than 5" is for hidden counts
 * only. Nothing is worked out from the count.
 */
export const hiddenBeside = (g: AGuarded, count: AGuarded): string | null =>
  g.suppressed && g.why === undefined && countShows(count) ? NOT_SHOWN : null;

/**
 * A rate or share in words with its count beside it, "12.4 per 1,000 · 25",
 * "62% · 140" or "Not shown · 25". When both read the same words (both
 * hidden), they read once.
 */
export function withCount(
  g: AGuarded,
  count: AGuarded,
  text: (g: AGuarded) => string,
): string {
  const r = hiddenBeside(g, count) ?? text(g);
  const c = valueText(count, "count");
  return r === c ? r : `${r} · ${c}`;
}

/** A headline per 1,000 as a share (Quality's agreement rate). */
const perThousandAsShare = (g: AGuarded): AGuarded =>
  g.value === null ? g : { ...g, value: g.value / 1000 };
/**
 * A headline per 1,000 in words: "12.4 per 1,000", or with `kind` "share"
 * (Quality's agreement rate) a percentage, "76%".
 */
export const headlineText = (g: AGuarded, kind: "rate" | "share") =>
  kind === "share"
    ? valueText(perThousandAsShare(g), "share")
    : valueText(g, "rate");
/**
 * A comparison value: the view's headline per 1,000. With `kind` "share"
 * (Quality's agreement rate) it reads as a percentage (per 1,000 ÷ 10).
 */
const compareText = (g: AGuarded, kind: GuardKind) =>
  kind === "share" || kind === "rate"
    ? headlineText(g, kind)
    : valueText(g, kind);

export const REASON_TEXT: Record<ComparisonReason, string> = {
  too_few_peers: "Not enough similar hospitals to compare",
  partly_standardised: "Not compared: partly standardised",
  too_little_history: "Not compared: under 3 months of data",
  small_group: "Not compared: too few patients",
};
export const VERDICT_TEXT: Record<
  NonNullable<Comparison["verdict"]>,
  string
> = {
  higher: "Higher than similar hospitals",
  lower: "Lower than similar hospitals",
  about_same: "About the same as similar hospitals",
};

/**
 * The comparison panel's lines, in order: the context, the hospital's own
 * last period, then the median of similar hospitals and the verdict. When
 * the comparison isn't available there is no median and no verdict, only
 * the reason. `previous` with no number and not hidden is "No earlier data".
 */
export function comparisonLines(
  c: Comparison,
  kind: GuardKind,
): {
  previous: string;
  median: string | null;
  verdict: string | null;
  reason: string | null;
  context: string;
} {
  const previous =
    !c.previous.suppressed && c.previous.value === null
      ? NO_EARLIER_DATA
      : compareText(c.previous, kind);
  const context = [
    `${valueText(c.context.size, "count")} patients seen`,
    KIND_LABEL[c.context.kind],
    COVERAGE_LABEL[c.context.coverage],
  ].join(" · ");
  const on = c.available;
  return {
    previous: `Last period: ${previous}`,
    median:
      on && c.peers !== null
        ? `Median of ${c.peers} similar hospitals: ${compareText(c.median, kind)}`
        : null,
    verdict: on && c.verdict ? VERDICT_TEXT[c.verdict] : null,
    reason: !on && c.reason ? REASON_TEXT[c.reason] : null,
    context,
  };
}
