// Reading the platform Analysis replies (spec §4, §5; backend §14.12). The
// browser is the last line of defence: each view is read on its own and
// fails closed ("Couldn't load {view}") on anything the server shouldn't
// have sent, so a failed view shows no numbers and never takes the others
// down. A view fails on:
//  - `{unavailable: true}`, a wrong shape, or any key the contract doesn't
//    have (an extra key may carry a name or a number), and on a patient
//    field anywhere (pid, mrn, dob, date_of_birth, address, patient_name);
//  - a scope, hospital or view that isn't the one asked for, or a period
//    that isn't the whole months ending last month for the period asked;
//  - a value the small-group rule should have hidden (a shown 1–4, a hidden
//    value with its number, a rate, share or median over a hidden or 1–4
//    numerator, base or complement), a share that gives its numerator away,
//    a set whose hidden member the rest give away, and a remainder of 1–4
//    published by subtraction (existing cases: cases − new; unrated
//    consultations: consultations − rated);
//  - `why` on a shown value, in One hospital scope, or in a hospital row;
//  - across hospitals: a remainder of 1–4 or exactly one hidden row (the
//    count, the base and the sizes), a shown figure from fewer than 3
//    hospitals, a hospital twice, a wrong "Partly standardised", two
//    "Not standardised" conditions, any drill, comparison or ward;
//  - for one hospital: a hospital list, or a comparison it can't vouch for;
//  - more than 20 pairs, or a shown pair after a hidden one.
import {
  guardedOk,
  isCount,
  isId,
  isNum,
  isObj,
  isTime,
  numeratorLeaks,
  remainderLeaks,
  setGivesAway,
  shows,
  type GuardKind,
  type Obj,
} from "@mhai/ui/guards";
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import {
  PART_PAIRS,
  familyOfFigure,
  type Figure,
  type PartPair,
} from "../api/analysis-contract";
import type {
  AGuarded,
  AnalysisPeriod,
  AnalysisQuery,
  AnalysisStatus,
  DataOf,
  FilterOptionsOut,
  Meta,
  ScopeKind,
  ViewId,
} from "../api/analysis-contract";

export type ViewState<T> = { status: "ok"; data: T } | { status: "failed" };

const FAILED = { status: "failed" } as const;

/** Keys that would carry a patient: never in an aggregate reply. */
const PATIENT_KEYS = new Set([
  "pid",
  "mrn",
  "dob",
  "date_of_birth",
  "address",
  "patient_name",
]);
/** Across hospitals a condition is coded at the 3-character ICD-10 level. */
const ICD3 = /^[A-Z][0-9]{2}$/;
const MONTHS: Record<AnalysisPeriod, number> = { "3m": 3, "6m": 6, "12m": 12 };
/** At most this many pairs, the hidden ones last. */
export const PAIRS_MAX = 20;
/** A hospital above this share of unstandardised records is partly standardised. */
const PARTLY_ABOVE = 0.1;
/** A comparison needs this many similar hospitals. */
const MIN_PEERS = 5;
/** An all-hospitals figure needs this many hospitals with cases. */
const MIN_HOSPITALS = 3;

const VIEWS: readonly ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
const COMPARED: ReadonlySet<ViewId> = new Set([
  "prevalence",
  "findings",
  "quality",
]);
const SEXES = ["female", "male", "other", "not_recorded"];
const SETTINGS = ["admitted", "outpatient", "emergency"];
const KINDS = ["general", "specialist", "teaching"];
const COVERAGES = ["consultations", "consultations_and_records"];
const FLAGS = ["high", "low", "abnormal"];
const VERDICTS = ["higher", "lower", "about_same"];
const REASONS = [
  "too_few_peers",
  "partly_standardised",
  "too_little_history",
  "small_group",
];
const EXCLUDED_REASONS = ["not_covered", "not_enough_data"];
const BANDS: Record<ScopeKind, readonly string[]> = {
  all: ["0-19", "20-39", "40-59", "60-79", "80+"],
  hospital: ["0-17", "18-39", "40-64", "65-79", "80+"],
};

// ---- The checking machinery ---------------------------------------------------
// Each check throws `Bad` with where and why; `viewProblem` turns it into a
// sentence (for tests), `readView` into "failed".

class Bad extends Error {}
function need(ok: boolean, where: string, why: string): asserts ok {
  if (!ok) throw new Bad(`${where}: ${why}`);
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const oneOf = (list: readonly unknown[], v: unknown) => list.includes(v);
/** A real calendar day, "YYYY-MM-DD". */
const isDay = (v: unknown): v is string =>
  isStr(v) &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Exactly these keys, plus any of `optional`: none missing, none other. */
function exact(
  v: unknown,
  keys: readonly string[],
  where: string,
  optional: readonly string[] = [],
): Obj {
  need(isObj(v), where, "not an object");
  for (const k of keys) need(Object.hasOwn(v, k), where, `no key ${k}`);
  for (const k of Object.keys(v))
    need(
      keys.includes(k) || optional.includes(k),
      where,
      `an unexpected key ${k}`,
    );
  return v;
}
function list(v: unknown, where: string): unknown[] {
  need(isArr(v), where, "not a list");
  return v;
}

/** Any key, at any depth, that would carry a patient. */
function patientKey(v: unknown, where: string): void {
  if (isArr(v)) v.forEach((x, i) => patientKey(x, `${where}[${i}]`));
  else if (isObj(v))
    for (const [k, x] of Object.entries(v)) {
      need(!PATIENT_KEYS.has(k), where, `a patient field ${k}`);
      patientKey(x, `${where}.${k}`);
    }
}

type Ctx = {
  scope: ScopeKind;
  /** Inside an all-hospitals row: one hospital's figure, so never `why`. */
  row?: boolean;
};
type G = AGuarded;

const hidden = (g: G) => g.suppressed;
const shown = (g: G) => shows(g);
const val = (g: G) => g.value as number;

/**
 * A guarded value: exactly `value` and `suppressed` (and `drill` when asked
 * for), plus `why` only on a hidden all-hospitals figure. `loose` lets a
 * share, rate or median be "nothing to measure" (`value: null`, not hidden).
 */
function guarded(
  v: unknown,
  kind: GuardKind,
  where: string,
  c: Ctx,
  { loose = false, drill = false } = {},
): G {
  const o = exact(
    v,
    drill ? ["value", "suppressed", "drill"] : ["value", "suppressed"],
    where,
    ["why"],
  );
  need(guardedOk(o, kind, loose), where, "a value that should be hidden");
  if (Object.hasOwn(o, "why")) {
    need(o.why === "too_few_hospitals", where, "an unknown why");
    need(o.suppressed === true, where, "why on a shown value");
    need(c.scope === "all" && !c.row, where, "why outside all hospitals");
  }
  if (drill && o.drill !== null) {
    need(c.scope === "hospital", where, "a drill across hospitals");
    need(
      isId(o.drill) &&
        o.suppressed === false &&
        isNum(o.value) &&
        o.value >= SMALL_GROUP_MIN,
      where,
      "a drill on a hidden value or a count under 5",
    );
  }
  return o as unknown as G;
}
const count = (v: unknown, where: string, c: Ctx) =>
  guarded(v, "count", where, c);
const drillable = (v: unknown, where: string, c: Ctx) =>
  guarded(v, "count", where, c, { drill: true });

/** The same figure under two names: both hidden, or both the same number. */
function same(a: G, b: G, where: string, what: string) {
  need(
    a.suppressed === b.suppressed && a.value === b.value,
    where,
    `not the same as ${what}`,
  );
}

/**
 * A rate: `count` over `base`, per 1,000. Its per 1,000 shows only over a
 * shown count and base, a base − count of 0 or 5+, and matches them (to
 * the rounding). With nothing to measure (a base of 0) it is empty.
 */
function rate(v: unknown, where: string, c: Ctx) {
  const r = exact(v, ["count", "base", "per_1000"], where);
  const n = count(r.count, `${where}.count`, c);
  const b = count(r.base, `${where}.base`, c);
  const p = guarded(r.per_1000, "rate", `${where}.per_1000`, c, {
    loose: true,
  });
  // Its complement (base − count) is a part-pair rest: see `pairsOk`.
  if (shown(n) && shown(b)) need(val(n) <= val(b), where, "count over base");
  if (shown(p)) {
    need(shown(n) && shown(b), where, "a rate over a hidden count or base");
    need(val(b) > 0, where, "a rate over nothing");
    need(
      Math.abs(val(p) - (val(n) / val(b)) * 1000) <= 0.5 + 1e-9,
      where,
      "a rate that doesn't match its count and base",
    );
  } else if (!p.suppressed)
    need(
      shown(b) && val(b) === 0,
      where,
      "an empty rate over a base that isn't 0",
    );
  return { count: n, base: b, per_1000: p };
}

/**
 * A set that adds up: a hidden member the rest give away leaks. Under a
 * shown total this is the shared rule (`setGivesAway`). A hidden total here
 * isn't always 1–4: across hospitals it may be hidden for too few
 * hospitals, or by second hiding so that a hospital's figure reads the same
 * in both scopes, and then shown members of 5 or more beside it are right.
 * What would leak is a hidden total with every member shown (they add up to
 * it); a hidden total of 1–4 has members of 0 or hidden anyway, and the
 * guards already refuse a shown 1–4.
 */
function setOk(total: G, members: G[], where: string) {
  const leaks = total.suppressed
    ? !members.some(hidden)
    : setGivesAway(total, members);
  need(!leaks, where, "a hidden member can be worked out");
}

/** The decimal places a share was sent with: at least 2 (a whole percent). */
function places(x: number): number {
  const s = String(x);
  if (/e/i.test(s)) return 12;
  const dot = s.indexOf(".");
  return Math.max(2, dot < 0 ? 0 : s.length - dot - 1);
}

/**
 * A share of a group: shows only over a shown member and group, never
 * gives the member (or the rest) away, and matches them to the rounding.
 */
function shareOf(member: G, total: G, v: unknown, where: string, c: Ctx) {
  const s = guarded(v, "share", where, c, { loose: true });
  if (shown(s)) {
    need(shown(member) && shown(total), where, "a share over a hidden count");
    need(val(total) > 0, where, "a share of nothing");
    need(!numeratorLeaks(total, s), where, "a share that gives 1–4 away");
    need(
      Math.abs(val(s) - val(member) / val(total)) <=
        0.5 * 10 ** -places(val(s)) + 1e-9,
      where,
      "a share that doesn't match its count",
    );
  } else if (!s.suppressed)
    need(shown(total) && val(total) === 0, where, "an empty share of a group");
  return s;
}

/**
 * The share of the first condition's patients who also have the second.
 * The first condition's patients aren't sent, but a share pins them down:
 * the reader fails when every whole number of patients the rounded share
 * could stand for leaves 1–4 outside the pair (or none does).
 */
function shareOfALeaks(n: number, s: number): boolean {
  if (n === 0) return s !== 0;
  const half = 0.5 * 10 ** -places(s);
  if (s - half <= 0) return false; // any number of patients: nothing pinned
  const lo = Math.max(n, Math.ceil(n / (s + half) - 1e-9));
  const hi = Math.floor(n / (s - half) + 1e-9);
  if (lo > hi) return true;
  for (let a = lo; a <= hi; a++) if (!isSmallCount(a - n)) return false;
  return true;
}

const conditionOk = (v: unknown, where: string) => {
  const c = exact(v, ["id", "name", "icd10"], where);
  need(isId(c.id), where, "a condition id that isn't opaque");
  need(c.name === null || isStr(c.name), where, "a condition name");
  need(c.icd10 === null || isStr(c.icd10), where, "a condition code");
  return c;
};
const personOk = (v: unknown, where: string) => {
  const p = exact(v, ["id", "name"], where);
  need(isId(p.id) && isStr(p.name) && p.name.trim() !== "", where, "a name");
  return p;
};
const locationOk = (v: unknown, where: string) => {
  const l = exact(v, ["id", "label", "setting"], where);
  need(
    isId(l.id) &&
      isStr(l.label) &&
      l.label.trim() !== "" &&
      (l.setting === null || oneOf(SETTINGS, l.setting)),
    where,
    "a location",
  );
  return l;
};
function unique(keys: unknown[], where: string, what: string) {
  const s = keys.map((k) => JSON.stringify(k));
  need(new Set(s).size === s.length, where, `${what} twice`);
}

// ---- The period -------------------------------------------------------------------

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** The first and last day of the `len` whole months ending the month before `now`. */
function monthsBefore(now: number, len: number) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    from: ymd(Date.UTC(y, m - len, 1)),
    to: ymd(Date.UTC(y, m, 0)),
  };
}
/**
 * Whole calendar months, ending with the last complete month. A reply a day
 * old at the turn of a month may still end the month before: it is still
 * whole months, never the month under way.
 */
function periodOk(v: unknown, period: AnalysisPeriod, now: number) {
  const p = exact(v, ["from", "to"], "period");
  need(isDay(p.from) && isDay(p.to), "period", "not days");
  const len = MONTHS[period];
  const fits = [now, now - 86_400_000].some((t) => {
    const want = monthsBefore(t, len);
    return want.from === p.from && want.to === p.to;
  });
  need(fits, "period", `not the ${len} whole months ending last month`);
  return p as { from: string; to: string };
}
/** "YYYY-MM" for each month of the period, in order. */
function monthsOf(p: { from: string; to: string }): string[] {
  const out: string[] = [];
  const [y, m] = p.from.split("-").map(Number);
  for (let i = 0; ; i++) {
    const at = ymd(Date.UTC(y, m - 1 + i, 1)).slice(0, 7);
    if (at > p.to.slice(0, 7)) return out;
    out.push(at);
  }
}

// ---- The views ----------------------------------------------------------------------

type ViewCtx = Ctx & {
  q: AnalysisQuery;
  /**
   * `patients` and `headline.base` for the sets and the part-pairs: across
   * hospitals a total hidden for too few hospitals while every row it adds
   * up from shows is known (Σ rows), so it reads as shown there.
   */
  setPatients: G;
  setBase: G;
  setCount: G;
  headline: { count: G; base: G; per_1000: G };
  patients: G;
  months: string[];
  comparison: Obj | null;
  /** Every condition the reply names, to check "Not standardised" once. */
  conditions: Obj[];
};

function prevalenceOk(d: unknown, c: ViewCtx) {
  const v = exact(d, ["by_condition", "series"], "data");
  const rows = list(v.by_condition, "by_condition");
  rows.forEach((x, i) => {
    const w = `data.by_condition[${i}]`;
    const r = exact(x, ["condition", "cases", "rate", "new"], w);
    c.conditions.push(conditionOk(r.condition, `${w}.condition`));
    const cases = drillable(r.cases, `${w}.cases`, c);
    if ((r.condition as Obj).id === c.q.condition)
      same(cases, c.patients, `${w}.cases`, "the filtered group");
    const rt = rate(r.rate, `${w}.rate`, c);
    same(cases, rt.count, `${w}.cases`, "its rate's count");
    same(rt.base, c.headline.base, `${w}.rate.base`, "the patients seen");
    const fresh = count(r.new, `${w}.new`, c);
    // Existing cases (cases − new) are a part-pair rest: see `pairsOk`.
    if (shown(cases) && shown(fresh))
      need(val(fresh) <= val(cases), `${w}.new`, "more new than cases");
  });
  unique(
    rows.map((r) => ((r as Obj).condition as Obj).id),
    "data.by_condition",
    "a condition",
  );
  const series = list(v.series, "series");
  need(
    series.length === c.months.length,
    "data.series",
    "not one point for each month of the period",
  );
  const available = c.comparison?.available === true;
  series.forEach((x, i) => {
    const w = `data.series[${i}]`;
    const p = exact(x, ["month", "rate", "median"], w);
    need(
      p.month === c.months[i],
      w,
      "not the period's months, in order (series)",
    );
    rate(p.rate, `${w}.rate`, c);
    if (p.median === null) return;
    need(c.scope === "hospital", `${w}.median`, "a median across hospitals");
    const m = guarded(p.median, "rate", `${w}.median`, c, { loose: true });
    need(
      !shown(m) || available,
      `${w}.median`,
      "a median without an available comparison",
    );
  });
}

/** One breakdown of the group: each member against the group's patients. */
function breakdown(
  v: unknown,
  key: string,
  where: string,
  c: ViewCtx,
  keyOk: (x: unknown, w: string) => unknown,
) {
  const rows = list(v, where).map((x, i) => {
    const w = `${where}[${i}]`;
    const r = exact(x, [key, "patients", "share"], w);
    const id = keyOk(r[key], `${w}.${key}`);
    const patients = drillable(r.patients, `${w}.patients`, c);
    shareOf(patients, c.patients, r.share, `${w}.share`, c);
    return { id, patients };
  });
  unique(
    rows.map((r) => r.id),
    where,
    "a group",
  );
  setOk(
    c.setPatients,
    rows.map((r) => r.patients),
    where,
  );
}

function affectedOk(d: unknown, c: ViewCtx) {
  const v = exact(
    d,
    ["by_age", "by_sex", "by_setting", "by_specialty", "by_location"],
    "data",
  );
  const pick =
    (allowed: readonly unknown[], what: string) => (x: unknown, w: string) => {
      need(oneOf(allowed, x), w, `not a ${what}`);
      return x;
    };
  breakdown(v.by_age, "band", "data.by_age", c, pick(BANDS[c.scope], "band"));
  breakdown(v.by_sex, "sex", "data.by_sex", c, pick(SEXES, "sex"));
  breakdown(
    v.by_setting,
    "setting",
    "data.by_setting",
    c,
    pick([...SETTINGS, null], "setting"),
  );
  breakdown(v.by_specialty, "specialty", "data.by_specialty", c, (x, w) => {
    need(x === null || (isStr(x) && x.trim() !== ""), w, "not a specialty");
    return x;
  });
  if (c.scope === "all") {
    need(v.by_location === null, "data.by_location", "a ward across hospitals");
    return;
  }
  breakdown(v.by_location, "location", "data.by_location", c, (x, w) =>
    x === null ? null : locationOk(x, w).id,
  );
}

function coOccurringOk(d: unknown, c: ViewCtx) {
  const v = exact(d, ["pairs"], "data");
  const pairs = list(v.pairs, "data.pairs");
  need(pairs.length <= PAIRS_MAX, "data.pairs", `more than ${PAIRS_MAX} pairs`);
  let hiddenSeen = false;
  const keys = pairs.map((x, i) => {
    const w = `data.pairs[${i}]`;
    const p = exact(x, ["a", "b", "patients", "share_of_a"], w);
    const a = conditionOk(p.a, `${w}.a`);
    const b = conditionOk(p.b, `${w}.b`);
    c.conditions.push(a, b);
    need(a.id !== b.id, w, "a condition paired with itself");
    const n = drillable(p.patients, `${w}.patients`, c);
    if (shown(n)) need(!hiddenSeen, w, "a shown pair after a hidden one");
    else hiddenSeen = true;
    const s = guarded(p.share_of_a, "share", `${w}.share_of_a`, c, {
      loose: true,
    });
    if (shown(s)) {
      need(shown(n), `${w}.share_of_a`, "a share over a hidden pair");
      need(
        !shareOfALeaks(val(n), val(s)),
        `${w}.share_of_a`,
        "a share that gives the first condition's patients away",
      );
    }
    return [a.id, b.id].map(String).sort();
  });
  unique(keys, "data.pairs", "a pair");
}

function findingsOk(d: unknown, c: ViewCtx) {
  const v = exact(d, ["findings", "alerts"], "data");
  const rows = list(v.findings, "data.findings").map((x, i) => {
    const w = `data.findings[${i}]`;
    const f = exact(x, ["name", "flag", "patients", "rate"], w);
    need(f.name === null || isStr(f.name), `${w}.name`, "not a name");
    need(f.flag === null || oneOf(FLAGS, f.flag), `${w}.flag`, "not a flag");
    const n = drillable(f.patients, `${w}.patients`, c);
    const r = rate(f.rate, `${w}.rate`, c);
    same(n, r.count, `${w}.patients`, "its rate's count");
    same(r.base, c.headline.base, `${w}.rate.base`, "the patients seen");
    return [f.name, f.flag];
  });
  unique(rows, "data.findings", "a finding");
  const a = exact(v.alerts, ["total", "by_severity"], "data.alerts");
  const total = count(a.total, "data.alerts.total", c);
  const sev = exact(
    a.by_severity,
    ["critical", "urgent", "info"],
    "data.alerts.by_severity",
  );
  setOk(
    total,
    (["critical", "urgent", "info"] as const).map((k) =>
      count(sev[k], `data.alerts.by_severity.${k}`, c),
    ),
    "data.alerts.by_severity",
  );
}

function qualityOk(d: unknown, c: ViewCtx) {
  const v = exact(d, ["by_condition"], "data");
  const rows = list(v.by_condition, "data.by_condition").map((x, i) => {
    const w = `data.by_condition[${i}]`;
    const r = exact(
      x,
      [
        "condition",
        "consultations",
        "confidence",
        "rated",
        "agreement_rate",
        "reviewers",
        "corrections",
      ],
      w,
    );
    const cond = conditionOk(r.condition, `${w}.condition`);
    c.conditions.push(cond);
    const cons = count(r.consultations, `${w}.consultations`, c);
    const mix = exact(
      r.confidence,
      ["high", "medium", "low"],
      `${w}.confidence`,
    );
    setOk(
      cons,
      (["high", "medium", "low"] as const).map((k) =>
        count(mix[k], `${w}.confidence.${k}`, c),
      ),
      `${w}.confidence`,
    );
    const rated = count(r.rated, `${w}.rated`, c);
    // Unrated consultations are a part-pair rest: see `pairsOk`.
    if (shown(cons) && shown(rated))
      need(val(rated) <= val(cons), `${w}.rated`, "more rated than seen");
    const agree = guarded(r.agreement_rate, "share", `${w}.agreement_rate`, c, {
      loose: true,
    });
    if (shown(agree))
      need(
        shown(rated) && val(rated) > 0 && !numeratorLeaks(rated, agree),
        `${w}.agreement_rate`,
        "an agreement rate that gives 1–4 away",
      );
    else if (!agree.suppressed)
      need(
        shown(rated) && val(rated) === 0,
        `${w}.agreement_rate`,
        "an empty agreement rate over ratings",
      );
    count(r.reviewers, `${w}.reviewers`, c);
    const corr = exact(
      r.corrections,
      ["total", "approved", "rejected", "waiting"],
      `${w}.corrections`,
    );
    setOk(
      count(corr.total, `${w}.corrections.total`, c),
      (["approved", "rejected", "waiting"] as const).map((k) =>
        count(corr[k], `${w}.corrections.${k}`, c),
      ),
      `${w}.corrections`,
    );
    return { id: cond.id, rated };
  });
  unique(
    rows.map((r) => r.id),
    "data.by_condition",
    "a condition",
  );
  // The headline's ratings are the conditions' ratings added up.
  setOk(
    c.setBase,
    rows.map((r) => r.rated),
    "data.by_condition.rated",
  );
}

const DATA_OK: Record<ViewId, (d: unknown, c: ViewCtx) => void> = {
  prevalence: prevalenceOk,
  affected: affectedOk,
  "co-occurring": coOccurringOk,
  findings: findingsOk,
  quality: qualityOk,
};

// ---- Across hospitals: the rows ----------------------------------------------------

const ROW_KEYS = [
  "hospital",
  "size",
  "kind",
  "coverage",
  "not_standardised_share",
  "partly_standardised",
  "headline",
];

/** At least 3 hospitals behind a shown figure: a shown count over 0, or a hidden one. */
function enoughHospitals(total: G, parts: G[], where: string) {
  // A shown 0 comes from no hospital, and gives none away.
  if (!shown(total) || val(total) === 0) return;
  const behind = parts.filter((p) => hidden(p) || val(p) > 0).length;
  need(
    behind >= MIN_HOSPITALS,
    where,
    `a shown figure from fewer than ${MIN_HOSPITALS} hospitals`,
  );
}

function hospitalRowsOk(v: unknown, view: ViewId, c: ViewCtx) {
  const rc: Ctx = { scope: "all", row: true };
  const rows = list(v, "hospitals").map((x, i) => {
    const w = `hospitals[${i}]`;
    const r = exact(x, ROW_KEYS, w);
    const h = personOk(r.hospital, `${w}.hospital`);
    const size = count(r.size, `${w}.size`, rc);
    need(oneOf(KINDS, r.kind), `${w}.kind`, "not a kind");
    need(oneOf(COVERAGES, r.coverage), `${w}.coverage`, "not a coverage");
    const ns = guarded(
      r.not_standardised_share,
      "share",
      `${w}.not_standardised_share`,
      rc,
      { loose: true },
    );
    need(
      typeof r.partly_standardised === "boolean",
      `${w}.partly_standardised`,
      "not a yes or no",
    );
    if (shown(ns)) {
      const half = 0.5 * 10 ** -places(val(ns));
      need(
        r.partly_standardised
          ? val(ns) + half > PARTLY_ABOVE
          : val(ns) - half <= PARTLY_ABOVE,
        `${w}.partly_standardised`,
        "partly standardised doesn't match its share",
      );
    }
    const head = rate(r.headline, `${w}.headline`, rc);
    // Patients seen is the base of every headline but Quality's.
    if (view !== "quality")
      same(size, head.base, `${w}.size`, "its headline's base");
    return { id: h.id, size, head };
  });
  unique(
    rows.map((r) => r.id),
    "hospitals",
    "a hospital",
  );
  const H = c.headline;
  const parts = {
    count: rows.map((r) => r.head.count),
    base: rows.map((r) => r.head.base),
    size: rows.map((r) => r.size),
  };
  need(
    !remainderLeaks(H.count, parts.count),
    "hospitals",
    "a remainder of the count that gives a hospital away",
  );
  need(
    !remainderLeaks(H.base, parts.base),
    "hospitals",
    "a remainder of the base that gives a hospital away",
  );
  if (view !== "quality")
    need(
      !remainderLeaks(H.base, parts.size),
      "hospitals",
      "a remainder of the sizes that gives a hospital away",
    );
  // With no condition filter the group is everyone seen: the sizes add up
  // to it, in every view (Quality too).
  if (c.q.condition === null)
    need(
      !remainderLeaks(c.patients, parts.size),
      "hospitals",
      "a remainder of patients over the sizes that gives a hospital away",
    );
  enoughHospitals(H.count, parts.count, "headline.count");
  enoughHospitals(H.base, parts.base, "headline.base");
}

// ---- One hospital: the comparison ----------------------------------------------------

const COMPARISON_KEYS = [
  "available",
  "reason",
  "peers",
  "current",
  "previous",
  "median",
  "verdict",
  "context",
];

function comparisonOk(v: unknown, view: ViewId, c: ViewCtx) {
  const w = "comparison";
  const k = exact(v, COMPARISON_KEYS, w);
  need(typeof k.available === "boolean", `${w}.available`, "not a yes or no");
  const on = k.available;
  need(
    on ? k.reason === null : oneOf(REASONS, k.reason),
    `${w}.reason`,
    "a reason that disagrees with available",
  );
  need(
    k.peers === null || isCount(k.peers),
    `${w}.peers`,
    "peers that aren't a whole number",
  );
  if (on)
    need(
      isCount(k.peers) && k.peers >= MIN_PEERS,
      `${w}.peers`,
      `available with fewer than ${MIN_PEERS} peers`,
    );
  const current = guarded(k.current, "rate", `${w}.current`, c, {
    loose: true,
  });
  same(current, c.headline.per_1000, `${w}.current`, "the headline");
  guarded(k.previous, "rate", `${w}.previous`, c, { loose: true });
  const median = guarded(k.median, "rate", `${w}.median`, c, { loose: true });
  need(on || !shown(median), `${w}.median`, "a median with available false");
  need(
    k.verdict === null || oneOf(VERDICTS, k.verdict),
    `${w}.verdict`,
    "not a verdict",
  );
  need(
    on || k.verdict === null,
    `${w}.verdict`,
    "a verdict with available false",
  );
  if (on)
    need(
      shown(current) && (k.verdict === null || shown(median)),
      `${w}.verdict`,
      "a comparison of a hidden value",
    );
  const ctx = exact(k.context, ["size", "kind", "coverage"], `${w}.context`);
  const size = count(ctx.size, `${w}.context.size`, c);
  need(oneOf(KINDS, ctx.kind), `${w}.context.kind`, "not a kind");
  need(
    oneOf(COVERAGES, ctx.coverage),
    `${w}.context.coverage`,
    "not a coverage",
  );
  if (view !== "quality")
    same(size, c.headline.base, `${w}.context.size`, "the patients seen");
  return k;
}

// ---- Figures inside figures ----------------------------------------------------------

/**
 * One figure of a reply, for `PART_PAIRS`: `key` pairs items of one family
 * inside a reply; `across` names the same figure in the other scope (a
 * condition by its 3-character code), or null when there is none there (a
 * band of one scope only, a ward, a hospital row).
 */
export type FigureItem = {
  key: string;
  across: string | null;
  value: AGuarded;
  flagged: boolean;
  /** The key of the item this one sits inside (a ward's setting row). */
  within?: string;
};

const icd3 = (c: Obj) => (isStr(c.icd10) ? c.icd10.slice(0, 3) : String(c.id));
const SHARED_BANDS = ["80+"];

/**
 * Every figure `PART_PAIRS` names, from a reply already read (or a sample
 * reply). Not for logging.
 */
export function figuresOf(raw: unknown): Map<Figure, FigureItem[]> {
  const r = raw as Obj;
  const d = (r.data ?? {}) as Obj;
  const out = new Map<Figure, FigureItem[]>();
  const add = (
    f: Figure,
    key: string,
    across: string | null,
    value: unknown,
    flagged = false,
    within?: string,
  ) => {
    const list = out.get(f) ?? [];
    const item: FigureItem = { key, across, value: value as AGuarded, flagged };
    if (within !== undefined) item.within = within;
    list.push(item);
    out.set(f, list);
  };
  const head = r.headline as Obj;
  add("patients", "", "", r.patients);
  add("headline.count", "", "", head.count);
  add("headline.base", "", "", head.base);
  for (const h of (r.hospitals ?? []) as Obj[]) {
    const id = String((h.hospital as Obj).id);
    add("row.size", id, null, h.size);
    add("row.count", id, null, (h.headline as Obj).count);
    add("row.base", id, null, (h.headline as Obj).base);
  }
  if (r.view === "prevalence") {
    for (const x of (d.series ?? []) as Obj[]) {
      const m = String(x.month);
      add("series.count", m, m, (x.rate as Obj).count);
      add("series.base", m, m, (x.rate as Obj).base);
    }
    for (const x of (d.by_condition ?? []) as Obj[]) {
      const c = x.condition as Obj;
      add("condition.cases", String(c.id), icd3(c), x.cases);
      add("condition.new", String(c.id), icd3(c), x.new);
    }
  }
  if (r.view === "affected")
    for (const [name, label, fig] of [
      ["by_age", "band", "member.patients"],
      ["by_sex", "sex", "member.patients"],
      ["by_setting", "setting", "setting.patients"],
      ["by_specialty", "specialty", "member.patients"],
      ["by_location", "location", "ward.patients"],
    ] as const)
      for (const x of (d[name] ?? []) as Obj[]) {
        const v = x[label];
        const id = isObj(v) ? String(v.id) : String(v);
        const shared =
          name === "by_location"
            ? null
            : name === "by_age" && !SHARED_BANDS.includes(id)
              ? null
              : `${name}:${id}`;
        // A ward sits inside its setting's row (LocationRef.setting).
        const within =
          isObj(v) && isStr(v.setting) ? `by_setting:${v.setting}` : undefined;
        add(fig, `${name}:${id}`, shared, x.patients, false, within);
      }
  if (r.view === "co-occurring")
    for (const x of (d.pairs ?? []) as Obj[]) {
      const a = x.a as Obj;
      const b = x.b as Obj;
      add(
        "pair.patients",
        [a.id, b.id].map(String).sort().join("|"),
        [icd3(a), icd3(b)].sort().join("|"),
        x.patients,
      );
    }
  if (r.view === "findings")
    for (const x of (d.findings ?? []) as Obj[]) {
      const k = `${x.name}|${x.flag}`;
      add("finding.patients", k, k, x.patients, x.flag !== null);
    }
  if (r.view === "quality")
    for (const x of (d.by_condition ?? []) as Obj[]) {
      const c = x.condition as Obj;
      add("quality.consultations", String(c.id), icd3(c), x.consultations);
      add("quality.rated", String(c.id), icd3(c), x.rated);
      add(
        "quality.corrections",
        String(c.id),
        icd3(c),
        (x.corrections as Obj).total,
      );
    }
  return out;
}

export { familyOfFigure };

/**
 * Each instance of each pair of a view, as [whole, part] items: one family
 * pairs item by item, a family part under a single whole pairs every item,
 * and a `within` part pairs with the whole item it sits inside.
 */
export function pairInstances(
  view: ViewId,
  figs: Map<Figure, FigureItem[]>,
): { pair: PartPair; whole: FigureItem; part: FigureItem }[] {
  const out: { pair: PartPair; whole: FigureItem; part: FigureItem }[] = [];
  for (const p of PART_PAIRS[view]) {
    const wholes = figs.get(p.whole) ?? [];
    const parts = (figs.get(p.part) ?? []).filter(
      (x) => p.only !== "flagged" || x.flagged,
    );
    const family = familyOfFigure(p.whole) !== null;
    for (const part of parts) {
      const whole = p.within
        ? wholes.find((w) => w.key === part.within)
        : family
          ? wholes.find((w) => w.key === part.key)
          : wholes[0];
      if (whole) out.push({ pair: p, whole, part });
    }
  }
  return out;
}

/** A hidden total whose every part shows is known: Σ parts. */
function recovered(total: G, parts: G[]): G {
  if (!total.suppressed || parts.length === 0 || !parts.every(shown))
    return total;
  return { value: parts.reduce((n, p) => n + val(p), 0), suppressed: false };
}

/**
 * Every part-pair of the view (`PART_PAIRS`): a shown part of a shown whole
 * must not exceed it, and must leave 0 or 5 or more.
 */
function pairsOk(view: ViewId, v: Obj, c: ViewCtx) {
  const figs = figuresOf(v);
  const single = (g: G): FigureItem[] => [
    { key: "", across: "", value: g, flagged: false },
  ];
  figs.set("patients", single(c.setPatients));
  figs.set("headline.base", single(c.setBase));
  figs.set("headline.count", single(c.setCount));
  for (const x of pairInstances(view, figs)) {
    const w = x.whole.value;
    const p = x.part.value;
    if (!shown(w) || !shown(p)) continue;
    const where = `${x.pair.whole} ⊇ ${x.pair.part}${x.part.key ? ` ${x.part.key}` : ""}`;
    need(val(p) <= val(w), where, "a part over its whole");
    need(!isSmallCount(val(w) - val(p)), where, `${x.pair.rest} leaving 1–4`);
  }
  // A setting less all its shown wards: its patients in no shown ward.
  for (const s of figs.get("setting.patients") ?? []) {
    if (!shown(s.value)) continue;
    const wards = (figs.get("ward.patients") ?? []).filter(
      (x) => x.within === s.key && shown(x.value),
    );
    if (wards.length < 2) continue;
    const rest = val(s.value) - wards.reduce((n, x) => n + val(x.value), 0);
    const where = `setting.patients ⊇ its wards ${s.key}`;
    need(rest >= 0, where, "wards over their setting");
    need(
      !isSmallCount(rest),
      where,
      "a setting's patients in no shown ward leaving 1–4",
    );
  }
}

// ---- The reply ----------------------------------------------------------------------

const META_KEYS = [
  "view",
  "scope",
  "hospital",
  "period",
  "updated_at",
  "patients",
  "headline",
  "hospitals",
  "comparison",
  "data",
];

function check(view: ViewId, raw: unknown, q: AnalysisQuery, now: number) {
  need(oneOf(VIEWS, view), "view", "not a view");
  need(
    isObj(raw) && !Object.hasOwn(raw, "unavailable"),
    "reply",
    "unavailable",
  );
  patientKey(raw, "reply");
  const v = exact(raw, META_KEYS, "reply");
  need(v.view === view, "view", "not the view asked for");
  need(v.scope === q.scope, "scope", "not the scope asked for");
  const c: Ctx = { scope: q.scope };
  if (q.scope === "all")
    need(v.hospital === null, "hospital", "a hospital across hospitals");
  else
    need(
      personOk(v.hospital, "hospital").id === q.hospital,
      "hospital",
      "not the hospital asked for",
    );
  const period = periodOk(v.period, q.period, now);
  need(isTime(v.updated_at), "updated_at", "not a time");
  const patients = count(v.patients, "patients", c);
  const headline = rate(v.headline, "headline", c);
  // The group under its other names: everyone seen with no condition
  // filter (every headline but Quality's is over patients seen), else the
  // condition's patients (the headline count of the views about conditions
  // in scope; Findings counts flagged patients, Quality ratings).
  if (q.condition === null) {
    if (view !== "quality")
      same(patients, headline.base, "patients", "the patients seen");
  } else if (view !== "quality" && view !== "findings")
    same(patients, headline.count, "patients", "the headline's count");

  let comparison: Obj | null = null;
  if (q.scope === "all") {
    need(v.comparison === null, "comparison", "a comparison across hospitals");
    need(v.hospitals !== null, "hospitals", "no hospital rows");
  } else {
    need(v.hospitals === null, "hospitals", "hospital rows for one hospital");
    if (v.comparison !== null) {
      need(COMPARED.has(view), "comparison", `a comparison in ${view}`);
    }
  }
  const vc: ViewCtx = {
    ...c,
    q,
    setPatients: patients,
    setBase: headline.base,
    setCount: headline.count,
    headline,
    patients,
    months: monthsOf(period),
    comparison: null,
    conditions: [],
  };
  if (q.scope === "hospital" && v.comparison !== null)
    comparison = comparisonOk(v.comparison, view, vc);
  vc.comparison = comparison;
  if (q.scope === "all") {
    hospitalRowsOk(v.hospitals, view, vc);
    const figs = figuresOf(v);
    const rows = (f: Figure) => (figs.get(f) ?? []).map((x) => x.value);
    vc.setCount = recovered(headline.count, rows("row.count"));
    vc.setBase = recovered(headline.base, rows("row.base"));
    // The group is everyone seen (no condition), or the headline count of
    // the views about conditions in scope.
    vc.setPatients =
      q.condition === null
        ? recovered(patients, rows("row.size"))
        : view === "quality" || view === "findings"
          ? patients
          : recovered(patients, rows("row.count"));
  }
  DATA_OK[view](v.data, vc);
  pairsOk(view, v, vc);

  if (q.scope === "all") {
    for (const x of vc.conditions)
      need(
        x.name === null
          ? x.icd10 === null
          : isStr(x.icd10) && ICD3.test(x.icd10),
        "data",
        "a condition across hospitals that isn't a 3-character code or Not standardised",
      );
    const unnamed = new Set(
      vc.conditions.filter((x) => x.name === null).map((x) => x.id),
    );
    need(
      unnamed.size <= 1,
      "data",
      "more than one Not standardised condition across hospitals",
    );
  }
}

/**
 * Why a view fails closed, in a sentence, or null when it reads. For tests
 * and local debugging only: never log it, and never beside a query.
 */
export function viewProblem(
  view: ViewId,
  raw: unknown,
  q: AnalysisQuery,
  now: number = Date.now(),
): string | null {
  try {
    check(view, raw, q, now);
    return null;
  } catch (e) {
    if (e instanceof Bad) return e.message;
    return "unreadable";
  }
}

/** A view that reads, with a copy of the query it was read against. */
export type ViewRead<V extends ViewId> =
  | { status: "ok"; data: Meta & { data: DataOf[V] }; query: AnalysisQuery }
  | { status: "failed" };

/**
 * One view's reply, read on its own against the query it answers; see the
 * file comment. A view that reads is copied, so nothing else can change it,
 * and keeps its query: the CSV labels the figures with the filters they
 * answer, not whatever the screen has moved on to.
 */
export function readView<V extends ViewId>(
  view: V,
  raw: unknown,
  q: AnalysisQuery,
  now: number = Date.now(),
): ViewRead<V> {
  if (viewProblem(view, raw, q, now) !== null) return FAILED;
  return {
    status: "ok",
    data: JSON.parse(JSON.stringify(raw)) as Meta & { data: DataOf[V] },
    query: { ...q },
  };
}

// ---- The status ----------------------------------------------------------------------

const STATUS_KEYS = [
  "aggregates_enabled",
  "patient_views_enabled",
  "sample",
  "hospitals",
  "my_clearances",
];

function statusCheck(raw: unknown) {
  patientKey(raw, "status");
  const s = exact(raw, STATUS_KEYS, "status");
  for (const k of ["aggregates_enabled", "patient_views_enabled", "sample"])
    need(typeof s[k] === "boolean", k, "not a yes or no");
  const h = exact(
    s.hospitals,
    ["included", "total", "list", "excluded"],
    "hospitals",
  );
  const inc = list(h.list, "hospitals.list").map(
    (p, i) => personOk(p, `hospitals.list[${i}]`).id,
  );
  const exc = list(h.excluded, "hospitals.excluded").map((x, i) => {
    const w = `hospitals.excluded[${i}]`;
    const e = exact(x, ["id", "name", "reason"], w);
    need(isId(e.id) && isStr(e.name) && e.name.trim() !== "", w, "a hospital");
    need(oneOf(EXCLUDED_REASONS, e.reason), w, "an unknown reason");
    return e.id;
  });
  unique([...inc, ...exc], "hospitals", "a hospital");
  need(
    isCount(h.included) && h.included === inc.length,
    "hospitals.included",
    "not the number in the list",
  );
  need(
    isCount(h.total) && h.total === inc.length + exc.length,
    "hospitals.total",
    "not the included and the excluded",
  );
  list(s.my_clearances, "my_clearances").forEach((x, i) => {
    const w = `my_clearances[${i}]`;
    const m = exact(x, ["hospital", "clearance_id", "until"], w);
    const id = personOk(m.hospital, `${w}.hospital`).id;
    need(inc.includes(id as string), w, "a hospital that isn't included");
    need(isId(m.clearance_id) && isTime(m.until), w, "a clearance");
  });
}

/** The status: who is in, who isn't and why, and the two switches. */
export function readStatus(raw: unknown): ViewState<AnalysisStatus> {
  try {
    statusCheck(raw);
  } catch {
    return FAILED;
  }
  return {
    status: "ok",
    data: JSON.parse(JSON.stringify(raw)) as AnalysisStatus,
  };
}

// ---- The filter options --------------------------------------------------------------

function optionsCheck(raw: unknown, scope: ScopeKind) {
  patientKey(raw, "options");
  const o = exact(
    raw,
    ["updated_at", "conditions", "specialties", "locations", "sources"],
    "options",
  );
  need(isTime(o.updated_at), "updated_at", "not a time");
  const conds = list(o.conditions, "conditions").map((x, i) =>
    conditionOk(x, `conditions[${i}]`),
  );
  unique(
    conds.map((x) => x.id),
    "conditions",
    "a condition",
  );
  const specs = list(o.specialties, "specialties");
  need(
    specs.every((s) => isStr(s) && s.trim() !== ""),
    "specialties",
    "a specialty",
  );
  unique(specs, "specialties", "a specialty");
  const locs = list(o.locations, "locations").map(
    (x, i) => locationOk(x, `locations[${i}]`).id,
  );
  unique(locs, "locations", "a location");
  const srcs = list(o.sources, "sources").map((x, i) => {
    const s = exact(x, ["id", "label"], `sources[${i}]`);
    need(
      isId(s.id) && isStr(s.label) && s.label.trim() !== "",
      `sources[${i}]`,
      "a source",
    );
    return s.id;
  });
  unique(srcs, "sources", "a source");
  if (scope === "all") {
    need(locs.length === 0, "locations", "wards across hospitals");
    need(srcs.length === 0, "sources", "sources across hospitals");
    need(
      conds.every((x) => x.icd10 === null || ICD3.test(x.icd10 as string)),
      "conditions",
      "a code finer than 3 characters across hospitals",
    );
    need(
      conds.filter((x) => x.name === null).length <= 1,
      "conditions",
      "more than one Not standardised",
    );
  } else need(srcs.length !== 1, "sources", "a single source");
}

/** The filter choices for a scope: no ward or source across hospitals. */
export function readFilterOptions(
  raw: unknown,
  scope: ScopeKind,
): ViewState<FilterOptionsOut> {
  try {
    optionsCheck(raw, scope);
  } catch {
    return FAILED;
  }
  return {
    status: "ok",
    data: JSON.parse(JSON.stringify(raw)) as FilterOptionsOut,
  };
}
