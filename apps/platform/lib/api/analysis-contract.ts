// The platform Analysis API (Plan 12, backend §14.12), hand-written from the
// assumed contract. To be replaced by types generated from the backend
// OpenAPI schema. Every id is opaque: [A-Za-z0-9_-]+.
//
// Every number is computed and hidden by the server under the small-group
// rule (a count of 1 to 4 is `{ value: null, suppressed: true }`), and every
// set that adds up is hidden as a set so no hidden member can be worked out.
// Across hospitals the server also hides a hospital whose figure the others
// would give away (second hiding), and any all-hospitals figure that comes
// from fewer than 3 hospitals (`why: "too_few_hospitals"`). Nothing here can
// carry a patient's name, record number, date of birth or address; the
// de-identified patient list (12b) is a separate path.
import type { Person, WriteOpts } from "./contract";

export type AnalysisPeriod = "3m" | "6m" | "12m";
export type ScopeKind = "all" | "hospital";
export type ViewId =
  "prevalence" | "affected" | "co-occurring" | "findings" | "quality";

/** A guarded value; `why` is only ever on a hidden value, across hospitals. */
export type AGuarded = {
  value: number | null;
  suppressed: boolean;
  why?: "too_few_hospitals";
};
/** `drill` is for 12b and for one hospital only; always null in 12a. */
export type Drillable = AGuarded & { drill: string | null };
/** `count` over `base`, per 1,000. */
export type Rate = { count: AGuarded; base: AGuarded; per_1000: AGuarded };

export type HospitalKind = "general" | "specialist" | "teaching";
export type Coverage = "consultations" | "consultations_and_records";
export type AllAgeBand = "0-19" | "20-39" | "40-59" | "60-79" | "80+";
export type HospitalAgeBand = "0-17" | "18-39" | "40-64" | "65-79" | "80+";
export type Sex = "female" | "male" | "other" | "not_recorded";
export type Setting = "admitted" | "outpatient" | "emergency";

/** A null `name` reads "Not standardised". */
export type ConditionRef = {
  id: string;
  name: string | null;
  icd10: string | null;
};
export type LocationRef = {
  id: string;
  label: string;
  setting: Setting | null;
};

export type AnalysisQuery = {
  scope: ScopeKind;
  hospital: string | null;
  period: AnalysisPeriod;
  condition: string | null;
  age_band: AllAgeBand | HospitalAgeBand | null;
  sex: Sex | null;
  setting: Setting | null;
  specialty: string | null;
  location: string | null;
  source: string | null;
};

/** At most this many filters at once: across hospitals, and for one. */
export const MAX_FILTERS = { all: 3, hospital: 4 } as const;

export type AnalysisStatus = {
  aggregates_enabled: boolean;
  patient_views_enabled: boolean;
  sample: boolean;
  hospitals: {
    included: number;
    total: number;
    /** The included hospitals only: the ones to pick from. */
    list: Person[];
    excluded: {
      id: string;
      name: string;
      reason: "not_covered" | "not_enough_data";
    }[];
  };
  /** Empty until 12b. */
  my_clearances: { hospital: Person; clearance_id: string; until: string }[];
};

export type FilterOptionsOut = {
  updated_at: string;
  conditions: ConditionRef[];
  specialties: string[];
  /** Empty across hospitals. */
  locations: LocationRef[];
  /** Empty across hospitals, and for a hospital with one source. */
  sources: { id: string; label: string }[];
};

export type HospitalRow = {
  hospital: Person;
  size: AGuarded;
  kind: HospitalKind;
  coverage: Coverage;
  not_standardised_share: AGuarded;
  partly_standardised: boolean;
  headline: Rate;
};

export type ComparisonReason =
  | "too_few_peers"
  | "partly_standardised"
  | "too_little_history"
  | "small_group";
/**
 * One hospital, on Prevalence, Findings and Quality only. The measure is the
 * view's headline rate per 1,000. For Quality that is the agreement rate:
 * agreements per 1,000 rated, shown as a percentage (`per_1000 / 10`).
 * `previous` is the hospital's own last period of the same
 * length: not suppressed but `null` when there is no data that far back.
 * `peers` is a count, never names.
 */
export type Comparison = {
  available: boolean;
  reason: ComparisonReason | null;
  peers: number | null;
  current: AGuarded;
  previous: AGuarded;
  median: AGuarded;
  verdict: "higher" | "lower" | "about_same" | null;
  context: { size: AGuarded; kind: HospitalKind; coverage: Coverage };
};

export type Meta = {
  view: ViewId;
  scope: ScopeKind;
  hospital: Person | null;
  /** "YYYY-MM-DD", whole calendar months. */
  period: { from: string; to: string };
  updated_at: string;
  patients: AGuarded;
  /**
   * The view's headline: Prevalence, Who is affected and Co-occurring: seen
   * patients with a condition in scope, per 1,000 seen; Findings: seen
   * patients with a flagged finding, per 1,000 seen; Quality: the agreement
   * rate, ratings the reviewers agreed with (`count`) over ratings (`base`),
   * per 1,000 rated. Tasks 6 and 7 show Quality's as a percentage
   * (`per_1000 / 10`), in the words "Reviewers agreed …".
   */
  headline: Rate;
  /** Across hospitals only. */
  hospitals: HospitalRow[] | null;
  /** One hospital, Prevalence, Findings and Quality only. */
  comparison: Comparison | null;
};

export type PrevalenceData = {
  by_condition: {
    condition: ConditionRef;
    cases: Drillable;
    rate: Rate;
    new: AGuarded;
  }[];
  /** `month` is "YYYY-MM"; `median` is for one hospital. */
  series: { month: string; rate: Rate; median: AGuarded | null }[];
};
export type Share = { patients: Drillable; share: AGuarded };
export type AffectedData = {
  by_age: ({ band: string } & Share)[];
  by_sex: ({ sex: Sex } & Share)[];
  by_setting: ({ setting: Setting | null } & Share)[];
  by_specialty: ({ specialty: string | null } & Share)[];
  /** Null across hospitals. */
  by_location: ({ location: LocationRef | null } & Share)[] | null;
};
export type CoOccurringData = {
  /** At most 20; hidden pairs come last. */
  pairs: {
    a: ConditionRef;
    b: ConditionRef;
    patients: Drillable;
    share_of_a: AGuarded;
  }[];
};
export type FindingsData = {
  findings: {
    name: string | null;
    flag: "high" | "low" | "abnormal" | null;
    patients: Drillable;
    rate: Rate;
  }[];
  alerts: {
    total: AGuarded;
    by_severity: Record<"critical" | "urgent" | "info", AGuarded>;
  };
};
export type QualityData = {
  by_condition: {
    condition: ConditionRef;
    consultations: AGuarded;
    confidence: Record<"high" | "medium" | "low", AGuarded>;
    rated: AGuarded;
    agreement_rate: AGuarded;
    reviewers: AGuarded;
    corrections: {
      total: AGuarded;
      approved: AGuarded;
      rejected: AGuarded;
      waiting: AGuarded;
    };
  }[];
};
export type DataOf = {
  prevalence: PrevalenceData;
  affected: AffectedData;
  "co-occurring": CoOccurringData;
  findings: FindingsData;
  quality: QualityData;
};
export type ViewOut<V extends ViewId> =
  (Meta & { data: DataOf[V] }) | { unavailable: true };

/** What the Download CSV button sends before the file is made. */
export type DownloadIn = { view: ViewId; query: AnalysisQuery };

export type AccessKind = "visit" | "download" | "patient_list";
export type FilterKey =
  | "condition"
  | "age_band"
  | "sex"
  | "setting"
  | "specialty"
  | "location"
  | "source";
/** One line of the access trail: who, what, where, never the figures. */
export type AccessEntry = {
  id: string;
  at: string;
  actor: Person;
  kind: AccessKind;
  scope: ScopeKind;
  hospital: Person | null;
  view: ViewId;
  period: AnalysisPeriod;
  filters: { key: FilterKey; label: string }[];
  count: number | null;
  clearance_id: string | null;
  flagged: boolean;
};
export type AccessQuery = {
  hospital?: string;
  kind?: AccessKind;
  cursor?: string;
};

export const VIEW_IDS: readonly ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];

/** The view's query string: only what is set (a null is never sent). */
export function analysisQueryParams(q: AnalysisQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== null && v !== "") p.set(k, v);
  return p.toString();
}

/** Platform admins only; an auditor gets 403 `forbidden` (except the trail). */
export interface AnalysisClient {
  /** 403 `analysis_off` is not sent for the status: it says so itself. */
  getAnalysisStatus(): Promise<AnalysisStatus>;
  getAnalysisFilters(
    scope: ScopeKind,
    hospital: string | null,
  ): Promise<FilterOptionsOut>;
  /** 403 `analysis_off`; 422 `too_many_filters` or `invalid`. */
  getAnalysisView<V extends ViewId>(
    view: V,
    q: AnalysisQuery,
  ): Promise<ViewOut<V>>;
  /** Audited before the file is made; no file on failure. */
  recordDownload(body: DownloadIn, opts: WriteOpts): Promise<void>;
  /** Platform admins and auditors both read the trail. */
  listAnalysisAccess(
    q: AccessQuery,
  ): Promise<{ entries: AccessEntry[]; next_cursor: string | null }>;
  exportAnalysisAccess(
    q: Omit<AccessQuery, "cursor">,
  ): Promise<{ filename: string; blob: Blob }>;
}
