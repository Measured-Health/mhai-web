// Reading the Analysis replies (spec §4, §5; core openapi 1.19.0). Each
// reply's shape is checked first, strictly (`analysis-schema.ts`: these
// keys and no others), then its values. Each view is read on its own
// and fails closed ("Couldn't load {view}") on a wrong shape or on any
// value the server should have hidden: a shown 1–4, a non-whole count, a
// share or median over a hidden count, a share that gives away 1–4 or its
// complement, a set whose hidden members can be worked out, a drill on a
// count under 5, a drill where core never sets one (`DRILL_ROWS`), or a
// series point that isn't a real day. A failed view
// never shows zeros and never takes the others down. The patient list is
// read only at the level asked for, and fails closed on any field outside
// its row: a de-identified row has no name, MRN or source and its count is
// the cell it was opened from; a named row (Plan 11c) adds only a name and
// an MRN, with a `named_until` still in the future.
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import type { GuardedOut } from "../api/admin-contract";
import type { DismissReason, FindingFlag } from "../api/alerts-contract";
import type {
  AgeBand,
  AnalysisFilters,
  ClearanceMeOut,
  ConditionRef,
  Drillable,
  FilterOptionsOut,
  LocationRef,
  DeidentifiedPatientsOut,
  HistoryPoint,
  Meta,
  NamedPatientRowOut,
  NamedPatientsOut,
  PatientLevel,
  PatientRowOut,
  PatientsOut,
  PeriodLevel,
  PeriodRef,
  Setting,
  Sex,
  ViewId,
  ViewOut,
} from "../api/analysis-contract";
import {
  guardedOk,
  hidden,
  isNum,
  isObj,
  numeratorLeaks,
  setGivesAway,
  shows,
} from "./guards";
import {
  DRILL_KEY_RE,
  NO_DRILL_FILTERS,
  PATIENTS_SCHEMA,
  filtersShapeOk,
  viewShapeOk,
} from "../api/analysis-schema";
import { isPeriodStart, periodSpan, prevPeriod, samePeriod } from "./periods";

export type ViewState<T> = { status: "ok"; data: T } | { status: "failed" };

/** The most rows a patient list may carry (spec §5). */
export const PATIENTS_MAX = 200;

const FAILED = { status: "failed" } as const;
const ID = /^[A-Za-z0-9_-]+$/;
const PID = /^P-[A-Z0-9]{4,12}$/;
export const AGE_BANDS: readonly AgeBand[] = [
  "0-17",
  "18-39",
  "40-64",
  "65-79",
  "80+",
];
export const SEXES: readonly Sex[] = [
  "female",
  "male",
  "other",
  "not_recorded",
];
export const SETTINGS: readonly Setting[] = [
  "admitted",
  "outpatient",
  "emergency",
];
const FLAGS = ["low", "high", "abnormal"];
const SEVERITIES = ["critical", "urgent", "info"] as const;
const REASONS = ["not_relevant", "already_known", "wrong_patient", "other"];
const LEVELS = ["high", "caution", "review", "failed"] as const;

type Obj = Record<string, unknown>;
type G = GuardedOut;

const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown) => v === null || isStr(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const oneOf = (list: readonly unknown[], v: unknown) => list.includes(v);
const isCount = (v: unknown): v is number =>
  isNum(v) && Number.isInteger(v) && v >= 0;
/** A real calendar day, "YYYY-MM-DD". */
export const isDay = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isTime = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}/.test(v) &&
  !Number.isNaN(Date.parse(v));

/**
 * An ISO instant with its zone: "Z" or "±hh:mm". A bare date, or a time with
 * no offset, would be read in the browser's own zone, so it fails.
 */
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const isInstant = (v: unknown): v is string =>
  typeof v === "string" && INSTANT.test(v) && !Number.isNaN(Date.parse(v));

const count = (v: unknown) => guardedOk(v, "count");
const share = (v: unknown) => guardedOk(v, "share", true);
const minutes = (v: unknown) => guardedOk(v, "minutes", true);
/**
 * Where core 1.19.0 sets a drill key: the affected view's age band, sex and
 * setting rows, the co-occurring pairs and the findings, and only under
 * condition, age band, sex or setting filters. Never on prevalence,
 * location or specialty rows, nor under a location, specialty or source
 * filter (pids are stable within a period, so lists split by a dimension
 * the rows don't show could be compared to find a hidden small group).
 */
export const DRILL_ROWS = {
  prevalence: [],
  affected: ["by_age", "by_sex", "by_setting"],
  "co-occurring": ["pairs"],
  findings: ["findings"],
  quality: [],
} as const satisfies Record<ViewId, readonly string[]>;

/** Whether core may set drills under these filters (see `DRILL_ROWS`). */
export const drillContext = (f: AnalysisFilters): boolean =>
  NO_DRILL_FILTERS.every((k) => f[k] === null);

/**
 * A count with a drill key only where it's shown and 5 or more, and only
 * where a list is `allowed`: a key anywhere else fails the view.
 */
function drillOk(v: unknown, allowed: boolean): boolean {
  if (!count(v) || !isObj(v) || !("drill" in v)) return false;
  const g = v as unknown as G;
  if (v.drill === null) return true;
  return (
    allowed &&
    isStr(v.drill) &&
    DRILL_KEY_RE.test(v.drill) &&
    !hidden(g) &&
    g.value! >= SMALL_GROUP_MIN
  );
}

const conditionOk = (c: unknown) =>
  isObj(c) && isId(c.id) && strOrNull(c.name) && strOrNull(c.icd10);
const locationOk = (l: unknown) =>
  isObj(l) &&
  isId(l.id) &&
  isStr(l.label) &&
  l.label.trim() !== "" &&
  (l.setting === null || oneOf(SETTINGS, l.setting));
/**
 * Every row passes `ok` and, given `key`, no key repeats (two rows for
 * one group would let a viewer add a hidden group up twice).
 */
const rows = (
  v: unknown,
  ok: (r: Obj) => boolean,
  key?: (r: Obj) => unknown,
): v is Obj[] =>
  isArr(v) &&
  v.every((r) => isObj(r) && ok(r)) &&
  (!key ||
    new Set((v as Obj[]).map((r) => JSON.stringify(key(r) ?? null))).size ===
      v.length);
const conditionKey = (c: unknown) => (c as Obj).id;

// ---- The views -------------------------------------------------------------------

/**
 * One finished period: `from` and `to` are exactly its span, and a quarter
 * is drawn by month, anything shorter by week.
 */
function periodOk(v: Obj): boolean {
  const p = v.period as Obj;
  if (!isObj(p) || !isStr(p.start)) return false;
  const level = p.level as PeriodLevel;
  if (!isPeriodStart(level, p.start)) return false;
  const span = periodSpan({ level, start: p.start });
  return (
    span.from === v.from &&
    span.to === v.to &&
    v.bucket === (level === "quarter" ? "month" : "week")
  );
}

/**
 * Earlier periods of the same level, oldest first, each before the one
 * asked for, with each point's new cases a part of its cases.
 */
function historyOk(v: Obj): boolean {
  const p = v.period as PeriodRef;
  const pts = v.history;
  if (!isArr(pts) || pts.length > 7) return false;
  let next = p;
  // Newest last, so walk back from the period asked for.
  for (let i = pts.length - 1; i >= 0; i--) {
    const h = pts[i] as Obj;
    if (!isObj(h) || !isStr(h.start)) return false;
    let prev = prevPeriod(next);
    // A gap is allowed (a period not answerable); never a repeat or a later one.
    while (prev.start > h.start) prev = prevPeriod(prev);
    if (prev.start !== h.start) return false;
    if (!count(h.cases) || !count(h.new) || !count(h.patients)) return false;
    if (!partOk(h.cases as G, h.new as G)) return false;
    next = prev;
  }
  return true;
}

function metaOk(v: Obj): boolean {
  return (
    isTime(v.updated_at) &&
    isDay(v.from) &&
    isDay(v.to) &&
    v.from <= v.to &&
    (v.bucket === "week" || v.bucket === "month") &&
    count(v.patients) &&
    periodOk(v) &&
    historyOk(v)
  );
}

/** A count and its two halves (new and existing), each shown or hidden as a set. */
function newExistingOk(cases: unknown, fresh: unknown, existing: unknown) {
  return (
    count(fresh) &&
    count(existing) &&
    !setGivesAway(cases as G, [fresh as G, existing as G])
  );
}

/**
 * A part of a total whose rest isn't sent: [part, total − part] is a set
 * against the total. Shown together they must leave 0 or 5+ (and the part
 * can't exceed the total); under a hidden total, the part is hidden or 0.
 * Used for a series point (new of cases; the rest is existing), dismissed
 * of all alerts, and rated of consultations.
 */
function partOk(total: G, part: G): boolean {
  if (hidden(total)) return !(shows(part) && part.value! > 0);
  if (shows(total) && shows(part)) {
    const rest = total.value! - part.value!;
    return rest >= 0 && !isSmallCount(rest);
  }
  return true;
}

function prevalenceOk(v: Obj): boolean {
  // Prevalence counts cases, not patients: it never has a drill.
  // Not a set against `patients`: one patient can count under several
  // conditions, so patients − cases gives nothing away.
  const t = v.total;
  if (
    !isObj(t) ||
    !count(t.cases) ||
    !newExistingOk(t.cases, t.new, t.existing)
  )
    return false;
  const byCondition = rows(
    v.by_condition,
    (r) =>
      conditionOk(r.condition) &&
      drillOk(r.cases, false) &&
      newExistingOk(r.cases, r.new, r.existing),
    (r) => conditionKey(r.condition),
  );
  const series = rows(
    v.series,
    (p) =>
      isDay(p.start) &&
      p.start >= (v.from as string) &&
      p.start <= (v.to as string) &&
      count(p.cases) &&
      count(p.new) &&
      partOk(p.cases as G, p.new as G),
    (p) => p.start,
  );
  return byCondition && series;
}

/** A partition of the patients: each member against the patient count. */
function partitionOk(
  v: unknown,
  patients: G,
  keyOk: (r: Obj) => boolean,
  key: (r: Obj) => unknown,
  drills: boolean,
): boolean {
  return (
    rows(v, (r) => keyOk(r) && drillOk(r.patients, drills), key) &&
    !setGivesAway(
      patients,
      (v as Obj[]).map((r) => r.patients as G),
    )
  );
}

function affectedOk(v: Obj, drills: boolean): boolean {
  const p = v.patients as G;
  return (
    partitionOk(
      v.by_age,
      p,
      (r) => r.band === null || oneOf(AGE_BANDS, r.band),
      (r) => r.band,
      drills,
    ) &&
    partitionOk(
      v.by_sex,
      p,
      (r) => oneOf(SEXES, r.sex),
      (r) => r.sex,
      drills,
    ) &&
    partitionOk(
      v.by_setting,
      p,
      (r) => r.setting === null || oneOf(SETTINGS, r.setting),
      (r) => r.setting,
      drills,
    ) &&
    partitionOk(
      v.by_location,
      p,
      (r) => r.location === null || locationOk(r.location),
      (r) => (r.location as Obj | null)?.id ?? null,
      false,
    ) &&
    partitionOk(
      v.by_specialty,
      p,
      (r) => strOrNull(r.specialty),
      (r) => r.specialty,
      false,
    )
  );
}

/**
 * A pair: "with both" and "with the first only" add up to the first
 * condition's patients, so a shown pair must leave 0 or 5+ outside it,
 * and nothing shows beside a hidden first condition. The share of the
 * first condition is hidden with either count, and gives nothing away.
 */
function pairOk(r: Obj, drills: boolean): boolean {
  if (!conditionOk(r.a) || !conditionOk(r.b)) return false;
  if (
    !count(r.a_patients) ||
    !drillOk(r.patients, drills) ||
    !share(r.share_of_a)
  )
    return false;
  const a = r.a_patients as G;
  const both = r.patients as G;
  const sh = r.share_of_a as G;
  if (hidden(a) && shows(both) && both.value! > 0) return false;
  if (shows(a) && shows(both)) {
    const rest = a.value! - both.value!;
    if (rest < 0 || isSmallCount(rest)) return false;
  }
  if ((hidden(a) || hidden(both)) && shows(sh)) return false;
  return !numeratorLeaks(a, sh);
}

/** A pair is the same whichever way round. */
const pairKey = (r: Obj) =>
  [conditionKey(r.a), conditionKey(r.b)].map(String).sort();
const coOccurringOk = (v: Obj, drills: boolean) =>
  rows(v.pairs, (r) => pairOk(r, drills), pairKey);

function findingsOk(v: Obj, drills: boolean): boolean {
  const list = rows(
    v.findings,
    (r) =>
      strOrNull(r.name) &&
      (r.flag === null || oneOf(FLAGS, r.flag)) &&
      drillOk(r.patients, drills) &&
      count(r.results),
    (r) => [r.name, r.flag],
  );
  const a = v.alerts;
  if (!list || !isObj(a) || !isObj(a.by_severity)) return false;
  const sev = a.by_severity;
  if (
    !count(a.total) ||
    !SEVERITIES.every((k) => count(sev[k])) ||
    !minutes(a.median_ack_minutes) ||
    !minutes(a.critical_median_ack_minutes) ||
    !count(a.dismissed) ||
    !rows(
      a.dismiss_reasons,
      (r) => oneOf(REASONS, r.reason) && count(r.count),
      (r) => r.reason,
    )
  )
    return false;
  const total = a.total as G;
  const critical = sev.critical as G;
  if (
    setGivesAway(
      total,
      SEVERITIES.map((k) => sev[k] as G),
    )
  )
    return false;
  // A median over a hidden count is hidden too.
  if (hidden(total) && shows(a.median_ack_minutes as G)) return false;
  if (!partOk(total, a.dismissed as G)) return false;
  if (
    (hidden(total) || hidden(critical)) &&
    shows(a.critical_median_ack_minutes as G)
  )
    return false;
  return !setGivesAway(
    a.dismissed as G,
    (a.dismiss_reasons as Obj[]).map((r) => r.count as G),
  );
}

function qualityRowOk(r: Obj): boolean {
  const mix = r.confidence;
  const c = r.corrections;
  if (!conditionOk(r.condition) || !isObj(mix) || !isObj(c)) return false;
  if (
    !count(r.consultations) ||
    !LEVELS.every((k) => count(mix[k])) ||
    !count(r.rated) ||
    !share(r.agreement_rate) ||
    !count(c.total) ||
    !count(c.approved) ||
    !count(c.rejected) ||
    !count(c.waiting)
  )
    return false;
  const rated = r.rated as G;
  const rate = r.agreement_rate as G;
  if (
    setGivesAway(
      r.consultations as G,
      LEVELS.map((k) => mix[k] as G),
    )
  )
    return false;
  if (
    setGivesAway(c.total as G, [
      c.approved as G,
      c.rejected as G,
      c.waiting as G,
    ])
  )
    return false;
  if ((hidden(rated) || hidden(r.consultations as G)) && shows(rate))
    return false;
  if (!partOk(r.consultations as G, rated)) return false;
  return !numeratorLeaks(rated, rate);
}

const qualityOk = (v: Obj) =>
  rows(v.by_condition, qualityRowOk, (r) => conditionKey(r.condition));

/** Each view's checks; `drills` is whether its context may carry drill keys. */
const VIEW_OK: Record<ViewId, (v: Obj, drills: boolean) => boolean> = {
  prevalence: prevalenceOk,
  affected: affectedOk,
  "co-occurring": coOccurringOk,
  findings: findingsOk,
  quality: qualityOk,
};

/**
 * One view's reply, read on its own; see the file comment. Given `asked`,
 * a reply for any other period fails too; given `filters`, a drill key
 * under a filter core never drills under fails it as well.
 */
export function readView<V extends ViewId>(
  view: V,
  raw: unknown,
  asked?: PeriodRef,
  filters?: AnalysisFilters,
): ViewState<ViewOut[V]> {
  const ok = Object.hasOwn(VIEW_OK, view) ? VIEW_OK[view] : null;
  if (!ok || !viewShapeOk(view, raw) || !isObj(raw)) return FAILED;
  const drills = filters === undefined || drillContext(filters);
  if (!metaOk(raw) || !ok(raw, drills)) return FAILED;
  if (asked && !samePeriod(asked, raw.period as PeriodRef)) return FAILED;
  return { status: "ok", data: BUILD[view](raw) as ViewOut[V] };
}

// ---- Rebuilding a read view from its known keys -------------------------------------
// Only the contract's keys reach the query cache: anything else the server
// adds is dropped (not failed, so a newer server still reads). Every value
// here has passed the checks above.

/** A number: hidden as `{ value: null, suppressed: true }`; never a drill. */
const g = (v: unknown): G => {
  const x = v as G;
  return x.suppressed
    ? { value: null, suppressed: true }
    : { value: x.value, suppressed: false };
};
/** A Drillable: its drill passed `drillOk` (shown, 5 or more, opaque) or is null. */
const dr = (v: unknown): Drillable => ({
  ...g(v),
  drill: (v as Drillable).drill,
});
const cond = (v: unknown): ConditionRef => {
  const c = v as ConditionRef;
  return { id: c.id, name: c.name, icd10: c.icd10 };
};
const loc = (v: unknown): LocationRef | null => {
  if (v === null) return null;
  const l = v as LocationRef;
  return { id: l.id, label: l.label, setting: l.setting };
};
const list = (v: unknown) => v as Obj[];
const obj = (v: unknown) => v as Obj;

const meta = (v: Obj): Meta => ({
  updated_at: v.updated_at as string,
  from: v.from as string,
  to: v.to as string,
  bucket: v.bucket as Meta["bucket"],
  patients: g(v.patients),
  period: {
    level: (v.period as PeriodRef).level,
    start: (v.period as PeriodRef).start,
  },
  history: list(v.history).map((h): HistoryPoint => ({
    start: h.start as string,
    cases: g(h.cases),
    new: g(h.new),
    patients: g(h.patients),
  })),
});

const BUILD: { [V in ViewId]: (v: Obj) => ViewOut[V] } = {
  prevalence: (v) => {
    const t = obj(v.total);
    return {
      ...meta(v),
      total: { cases: g(t.cases), new: g(t.new), existing: g(t.existing) },
      by_condition: list(v.by_condition).map((r) => ({
        condition: cond(r.condition),
        cases: dr(r.cases),
        new: g(r.new),
        existing: g(r.existing),
      })),
      series: list(v.series).map((p) => ({
        start: p.start as string,
        cases: g(p.cases),
        new: g(p.new),
      })),
    };
  },
  affected: (v) => ({
    ...meta(v),
    by_age: list(v.by_age).map((r) => ({
      band: r.band as AgeBand | null,
      patients: dr(r.patients),
    })),
    by_sex: list(v.by_sex).map((r) => ({
      sex: r.sex as Sex,
      patients: dr(r.patients),
    })),
    by_setting: list(v.by_setting).map((r) => ({
      setting: r.setting as Setting | null,
      patients: dr(r.patients),
    })),
    by_location: list(v.by_location).map((r) => ({
      location: loc(r.location),
      patients: dr(r.patients),
    })),
    by_specialty: list(v.by_specialty).map((r) => ({
      specialty: r.specialty as string | null,
      patients: dr(r.patients),
    })),
  }),
  "co-occurring": (v) => ({
    ...meta(v),
    pairs: list(v.pairs).map((r) => ({
      a: cond(r.a),
      b: cond(r.b),
      a_patients: g(r.a_patients),
      patients: dr(r.patients),
      share_of_a: g(r.share_of_a),
    })),
  }),
  findings: (v) => {
    const a = obj(v.alerts);
    const sev = obj(a.by_severity);
    return {
      ...meta(v),
      findings: list(v.findings).map((r) => ({
        name: r.name as string | null,
        flag: r.flag as FindingFlag | null,
        patients: dr(r.patients),
        results: g(r.results),
      })),
      alerts: {
        total: g(a.total),
        by_severity: {
          critical: g(sev.critical),
          urgent: g(sev.urgent),
          info: g(sev.info),
        },
        median_ack_minutes: g(a.median_ack_minutes),
        critical_median_ack_minutes: g(a.critical_median_ack_minutes),
        dismissed: g(a.dismissed),
        dismiss_reasons: list(a.dismiss_reasons).map((r) => ({
          reason: r.reason as DismissReason,
          count: g(r.count),
        })),
      },
    };
  },
  quality: (v) => ({
    ...meta(v),
    by_condition: list(v.by_condition).map((r) => {
      const mix = obj(r.confidence);
      const c = obj(r.corrections);
      return {
        condition: cond(r.condition),
        consultations: g(r.consultations),
        confidence: {
          high: g(mix.high),
          caution: g(mix.caution),
          review: g(mix.review),
          failed: g(mix.failed),
        },
        agreement_rate: g(r.agreement_rate),
        rated: g(r.rated),
        corrections: {
          total: g(c.total),
          approved: g(c.approved),
          rejected: g(c.rejected),
          waiting: g(c.waiting),
        },
      };
    }),
  }),
};

// ---- The filter options ----------------------------------------------------------

/** A level's periods: real first days of that level, oldest first, none twice. */
const periodListOk = (level: PeriodLevel, days: unknown) =>
  isArr(days) &&
  days.every(
    (d, i) =>
      isStr(d) &&
      isPeriodStart(level, d) &&
      (i === 0 || (days[i - 1] as string) < d),
  );

export function readFilterOptions(raw: unknown): ViewState<FilterOptionsOut> {
  if (!filtersShapeOk(raw) || !isObj(raw)) return FAILED;
  if (raw.updated_at !== null && !isTime(raw.updated_at)) return FAILED;
  const { conditions, locations, specialties, sources } = raw;
  const periods = raw.periods as Obj;
  if (
    !periodListOk("week", periods.week) ||
    !periodListOk("month", periods.month) ||
    !periodListOk("quarter", periods.quarter) ||
    !rows(conditions, conditionOk, (c) => c.id) ||
    !rows(locations, locationOk, (l) => l.id) ||
    !isArr(specialties) ||
    !specialties.every((s) => isStr(s) && s.trim() !== "") ||
    new Set(specialties).size !== specialties.length ||
    !rows(
      sources,
      (s) => isId(s.id) && isStr(s.label) && s.label.trim() !== "",
      (s) => s.id,
    )
  )
    return FAILED;
  return {
    status: "ok",
    data: {
      updated_at: raw.updated_at as string | null,
      periods: {
        week: [...(periods.week as string[])],
        month: [...(periods.month as string[])],
        quarter: [...(periods.quarter as string[])],
      },
      conditions: conditions.map((c) => ({
        id: c.id as string,
        name: c.name as string | null,
        icd10: c.icd10 as string | null,
      })),
      locations: locations.map((l) => ({
        id: l.id as string,
        label: l.label as string,
        setting: l.setting as Setting | null,
      })),
      specialties: [...(specialties as string[])],
      sources: sources.map((s) => ({
        id: s.id as string,
        label: s.label as string,
      })),
    },
  };
}

// ---- The patient list ------------------------------------------------------------

const ROW_KEYS = [
  "pid",
  "age_band",
  "sex",
  "setting",
  "conditions",
  "findings",
] as const satisfies readonly (keyof PatientRowOut)[];
const NAMED_ROW_KEYS = [
  ...ROW_KEYS,
  "name",
  "mrn",
] as const satisfies readonly (keyof NamedPatientRowOut)[];
const CONDITION_KEYS = ["id", "name", "icd10"] as const;
const FINDING_KEYS = ["name", "flag", "source_label"] as const;
const REPLY_KEYS = ["level", "count", "patients"] as const;
const NAMED_REPLY_KEYS = [...REPLY_KEYS, "named_until", "clearance"] as const;
const CLEARANCE_KEYS = ["id", "end_date"] as const;

/** Exactly these keys: none missing, none other (a name, an MRN, a date of birth, an address). */
const exactKeys = (o: Obj, keys: readonly string[]) => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(o, k));
};
/** A name or an MRN: words, not blank, not a paragraph. */
const isLabel = (v: unknown): v is string =>
  isStr(v) && v.trim() !== "" && v.length <= 200;

function patientRowOk(r: Obj, keys: readonly string[]): boolean {
  return (
    exactKeys(r, keys) &&
    isStr(r.pid) &&
    PID.test(r.pid) &&
    (r.age_band === null || oneOf(AGE_BANDS, r.age_band)) &&
    oneOf(SEXES, r.sex) &&
    (r.setting === null || oneOf(SETTINGS, r.setting)) &&
    rows(r.conditions, (c) => exactKeys(c, CONDITION_KEYS) && conditionOk(c)) &&
    rows(
      r.findings,
      (f) =>
        exactKeys(f, FINDING_KEYS) &&
        strOrNull(f.name) &&
        (f.flag === null || oneOf(FLAGS, f.flag)) &&
        strOrNull(f.source_label),
    )
  );
}
const namedRowOk = (r: Obj) =>
  patientRowOk(r, NAMED_ROW_KEYS) && isLabel(r.name) && isLabel(r.mrn);

const rowOf = (r: PatientRowOut): PatientRowOut => ({
  pid: r.pid,
  age_band: r.age_band,
  sex: r.sex,
  setting: r.setting,
  conditions: r.conditions.map((c) => ({
    id: c.id,
    name: c.name,
    icd10: c.icd10,
  })),
  findings: r.findings.map((f) => ({
    name: f.name,
    flag: f.flag,
    source_label: f.source_label,
  })),
});

/**
 * The patients behind a shown count, read only at the level asked for: at
 * most 200 rows, a count of 5 or more, and no field outside the row. A
 * de-identified reply is first read strictly (`PATIENTS_SCHEMA`: no source
 * on a row), and given `cell`, its count must be that shown count exactly.
 * A named reply also needs a `named_until` after `now` and the clearance it
 * rests on.
 */
export function readPatients(
  raw: unknown,
  expected: "deidentified",
  now: number,
  cell?: number,
): ViewState<DeidentifiedPatientsOut>;
export function readPatients(
  raw: unknown,
  expected: "named",
  now: number,
): ViewState<NamedPatientsOut>;
export function readPatients(
  raw: unknown,
  expected: PatientLevel,
  now: number,
): ViewState<PatientsOut>;
export function readPatients(
  raw: unknown,
  expected: PatientLevel,
  now: number,
  cell?: number,
): ViewState<PatientsOut> {
  if (!isObj(raw) || raw.level !== expected) return FAILED;
  const named = expected === "named";
  if (!named && !PATIENTS_SCHEMA.safeParse(raw).success) return FAILED;
  if (!named && cell !== undefined && raw.count !== cell) return FAILED;
  if (!exactKeys(raw, named ? NAMED_REPLY_KEYS : REPLY_KEYS)) return FAILED;
  const list = raw.patients;
  const rowOk = named ? namedRowOk : (r: Obj) => patientRowOk(r, ROW_KEYS);
  if (!rows(list, rowOk) || list.length > PATIENTS_MAX) return FAILED;
  const n = raw.count;
  if (!isCount(n) || isSmallCount(n) || n < list.length) return FAILED;
  if (new Set(list.map((r) => r.pid)).size !== list.length) return FAILED;
  if (!named)
    return {
      status: "ok",
      data: {
        level: "deidentified",
        count: n,
        patients: (list as PatientRowOut[]).map(rowOf),
      },
    };
  const until = raw.named_until;
  if (!isInstant(until) || !(Date.parse(until) > now)) return FAILED;
  const c = raw.clearance;
  if (!isObj(c) || !exactKeys(c, CLEARANCE_KEYS)) return FAILED;
  if (!isId(c.id) || !isDay(c.end_date)) return FAILED;
  return {
    status: "ok",
    data: {
      level: "named",
      count: n,
      patients: (list as NamedPatientRowOut[]).map((r) => ({
        ...rowOf(r),
        name: r.name,
        mrn: r.mrn,
      })),
      named_until: until,
      clearance: { id: c.id, end_date: c.end_date },
    },
  };
}

// ---- Whether names may show right now ------------------------------------------

const ME_KEYS = [
  "named",
  "until",
  "clearance_id",
  "version",
  "reason",
] as const satisfies readonly (keyof ClearanceMeOut)[];
const ME_REASONS = [
  "none",
  "ended",
  "revoked",
  "removed_from_letter",
  "role_or_account",
  "switched_off",
] as const satisfies readonly ClearanceMeOut["reason"][];

/** `clearance/me`, or null on a wrong shape (which ends a named view). */
export function readClearanceMe(raw: unknown): ClearanceMeOut | null {
  if (!isObj(raw) || !exactKeys(raw, ME_KEYS)) return null;
  const { named, until, clearance_id, version, reason } = raw;
  if (!isCount(version)) return null;
  if (named === true) {
    if (!isInstant(until) || !isId(clearance_id) || reason !== null)
      return null;
    return { named, until, clearance_id, version, reason };
  }
  if (
    named !== false ||
    until !== null ||
    clearance_id !== null ||
    version !== 0
  )
    return null;
  if (reason !== null && !oneOf(ME_REASONS, reason)) return null;
  return {
    named,
    until,
    clearance_id,
    version,
    reason: reason as ClearanceMeOut["reason"],
  };
}
