// The demo's platform Analysis (Plan 12), built on the mock core. Memory
// only. Every figure is counted from the synthetic cohorts and then hidden
// the way the server must hide it (spec §5): 1 to 4 hidden, sets hidden until
// nothing is given away, a second hospital hidden when the shown rows would
// give the first away, too few hospitals, and comparisons only over 5 or more
// fair peers. It refuses what the backend refuses, with the same codes. No
// reply carries a patient: the cohorts are only ever counted.
import { ApiError } from "@mhai/api-client/errors";
import { toCsv } from "@mhai/ui/csv";
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import {
  MAX_FILTERS,
  VIEW_IDS,
  type AGuarded,
  type AccessEntry,
  type AccessKind,
  type AccessQuery,
  type AllAgeBand,
  type AffectedData,
  type AnalysisClient,
  type AnalysisPeriod,
  type AnalysisQuery,
  type AnalysisStatus,
  type CoOccurringData,
  type Comparison,
  type ConditionRef,
  type DownloadIn,
  type FilterKey,
  type FilterOptionsOut,
  type FindingsData,
  type HospitalAgeBand,
  type HospitalRow,
  type Meta,
  type PrevalenceData,
  type QualityData,
  type Rate,
  type ScopeKind,
  type Setting,
  type Sex,
  type ViewId,
  type ViewOut,
} from "./analysis-contract";
import {
  ALL_CONDITIONS,
  CONDITIONS,
  EXCLUDED,
  LOCATIONS,
  MONTHS,
  PROFILES,
  SPECIALTIES,
  UNMAPPED,
  allId,
  cohortOf,
  seedAccess,
  type Profile,
} from "./analysis-fixtures";
import type { Person, TeamMember, WriteOpts } from "./contract";
import type { MockCore } from "./mock";

export type AnalysisMode =
  "normal" | "unavailable" | "off" | "few_peers" | { failView: ViewId };

/** The all-hospitals figure needs this many hospitals with cases. */
const MIN_HOSPITALS = 3;
/** A comparison needs this many fair peers. */
const MIN_PEERS = 5;
/** A hospital with a larger share of unstandardised records is left out. */
const PARTLY_ABOVE = 0.1;
/** The verdict's band around the median. */
const BAND = 0.1;
const PAGE = 50;
const TRAIL_MAX = 500;
const SHORT_HISTORY = 3;
const TOP = 20;

const PERIODS: Record<AnalysisPeriod, number> = { "3m": 3, "6m": 6, "12m": 12 };
const SEXES: readonly Sex[] = ["female", "male", "other", "not_recorded"];
const SETTINGS: readonly Setting[] = ["admitted", "outpatient", "emergency"];
const ALL_BANDS: readonly AllAgeBand[] = [
  "0-19",
  "20-39",
  "40-59",
  "60-79",
  "80+",
];
const HOSPITAL_BANDS: readonly HospitalAgeBand[] = [
  "0-17",
  "18-39",
  "40-64",
  "65-79",
  "80+",
];
const KINDS: readonly AccessKind[] = ["visit", "download", "patient_list"];
const FILTER_KEYS: readonly FilterKey[] = [
  "condition",
  "age_band",
  "sex",
  "setting",
  "specialty",
  "location",
  "source",
];

const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const iso = (ms: number) => new Date(ms).toISOString();
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });

const hide = (): AGuarded => ({ value: null, suppressed: true });
const round = (x: number, places: number) => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};
const allBand = (age: number): AllAgeBand =>
  age < 20
    ? "0-19"
    : age < 40
      ? "20-39"
      : age < 60
        ? "40-59"
        : age < 80
          ? "60-79"
          : "80+";
const hospitalBand = (age: number): HospitalAgeBand =>
  age < 18
    ? "0-17"
    : age < 40
      ? "18-39"
      : age < 65
        ? "40-64"
        : age < 80
          ? "65-79"
          : "80+";

// --- hiding, the way the server must ---

/**
 * Hides the next-smallest shown member, again and again, while the hidden
 * ones could be worked out: only one is hidden, or the hidden ones together
 * are 1 to 4. `hidden` is changed in place.
 */
function closeSet(raw: number[], hidden: boolean[]) {
  const count = () => hidden.filter(Boolean).length;
  const sum = () => raw.reduce((s, v, i) => (hidden[i] ? s + v : s), 0);
  while (count() > 0 && (count() < 2 || sum() < SMALL_GROUP_MIN)) {
    let next = -1;
    raw.forEach((v, i) => {
      if (!hidden[i] && v > 0 && (next < 0 || v < raw[next]!)) next = i;
    });
    if (next < 0) break;
    hidden[next] = true;
  }
}

type Rec = Record<string, number>;
/** What the second hiding took from one hospital, on top of the plain rule. */
type Forced = { head: boolean; seen: boolean };
const NOT_FORCED: Forced = { head: false, seen: false };
/** The patients-seen counts: a figure's base. */
const isBase = (k: string) => k === "seen" || k.startsWith("ms:");

/**
 * Counted figures, and how each is hidden. `hosp` is, across hospitals, how
 * many hospitals have any cases for each key.
 */
class Ctx {
  constructor(
    readonly v: Rec,
    readonly hosp: Rec | null = null,
    readonly forced: Forced = NOT_FORCED,
  ) {}
  n(k: string) {
    return this.v[k] ?? 0;
  }
  private few(k: string) {
    return (
      this.hosp !== null && this.n(k) > 0 && (this.hosp[k] ?? 0) < MIN_HOSPITALS
    );
  }
  hidden(k: string) {
    const n = this.n(k);
    if (n === 0) return false;
    return (
      (isBase(k) ? this.forced.seen : this.forced.head) ||
      isSmallCount(n) ||
      this.few(k)
    );
  }
  g(k: string): AGuarded {
    if (!this.hidden(k)) return { value: this.n(k), suppressed: false };
    return this.few(k)
      ? { value: null, suppressed: true, why: "too_few_hospitals" }
      : hide();
  }
  /** A rate hides when its count or base does, or what is left of the base. */
  rate(ck: string, bk: string): Rate {
    const count = this.g(ck);
    const base = this.g(bk);
    const why = count.why ?? base.why;
    let per: AGuarded;
    if (count.suppressed || base.suppressed)
      per = why ? { ...hide(), why } : hide();
    else if (base.value === 0) per = { value: null, suppressed: false };
    else if (isSmallCount(base.value! - count.value!)) per = hide();
    else
      per = {
        value: round((count.value! / base.value!) * 1000, 1),
        suppressed: false,
      };
    return { count, base, per_1000: per };
  }
  /** A share, over a numerator already decided (a set's member), if given. */
  share(nk: string, dk: string, num: AGuarded = this.g(nk)): AGuarded {
    const den = this.g(dk);
    if (num.suppressed || den.suppressed) return hide();
    if (den.value === 0) return { value: null, suppressed: false };
    if (isSmallCount(den.value! - num.value!)) return hide();
    return { value: round(num.value! / den.value!, 2), suppressed: false };
  }
  /** A set that adds up: a hidden member can't be worked out from the rest. */
  set(keys: string[]): AGuarded[] {
    const raw = keys.map((k) => this.n(k));
    const hidden = keys.map((k) => this.hidden(k));
    closeSet(raw, hidden);
    return keys.map((k, i) =>
      !hidden[i] ? this.g(k) : this.hidden(k) ? this.g(k) : hide(),
    );
  }
}

// --- counting the cohorts ---

type Filters = Pick<
  AnalysisQuery,
  | "condition"
  | "age_band"
  | "sex"
  | "setting"
  | "specialty"
  | "location"
  | "source"
>;
type Win = { from: number; to: number };

const profileOf = (id: string): Profile =>
  PROFILES.find((p) => p.id === id) ?? fail(404, "not_found");
const ORDER = {
  all: [...ALL_CONDITIONS.map((c) => c.id), UNMAPPED],
  hospital: CONDITIONS.map((c) => c.id),
} as const;

const tallies = new Map<string, Rec>();
const notStdCache = new Map<string, { num: number; den: number }>();

/**
 * Every figure any view needs for one hospital, counted in one pass: the
 * patients seen in the months, who match the filters.
 */
function tally(h: string, map: ScopeKind, f: Filters, win: Win): Rec {
  const key = `${h}|${map}|${JSON.stringify(f)}|${win.from}-${win.to}`;
  const hit = tallies.get(key);
  if (hit) return hit;
  const cid = (id: string) => (map === "all" ? allId(id) : id);
  const band = map === "all" ? allBand : hospitalBand;
  const order = ORDER[map];
  const v: Rec = {};
  const add = (k: string) => void (v[k] = (v[k] ?? 0) + 1);
  const reviewers = new Map<string, Set<string>>();
  const within = (m: number) => m >= win.from && m <= win.to;

  for (const p of cohortOf(h)) {
    if (f.sex !== null && p.sex !== f.sex) continue;
    if (f.setting !== null && p.setting !== f.setting) continue;
    if (f.specialty !== null && p.specialty !== f.specialty) continue;
    if (f.location !== null && p.location !== f.location) continue;
    if (f.source !== null && p.source !== f.source) continue;
    if (f.age_band !== null && band(p.age) !== f.age_band) continue;
    const visits = p.visits.filter(within);
    if (visits.length === 0) continue;
    add("seen");
    const scoped = (to: number) =>
      p.conditions.filter(
        (c) =>
          c.onset <= to && (f.condition === null || cid(c.id) === f.condition),
      );
    for (const m of visits) {
      add(`ms:${m}`);
      if (scoped(m).length > 0) add(`mh:${m}`);
    }
    const known = p.conditions.filter((c) => c.onset <= win.to);
    const inScope = scoped(win.to);
    if (f.condition !== null && inScope.length === 0) continue;
    add("group");
    if (inScope.length > 0) add("head");

    // Prevalence.
    for (const c of inScope) {
      add(`c:${cid(c.id)}`);
      if (c.onset >= win.from) add(`n:${cid(c.id)}`);
    }
    // Who is affected.
    add(`age:${band(p.age)}`);
    add(`sex:${p.sex}`);
    add(`set:${p.setting ?? "-"}`);
    add(`spec:${p.specialty ?? "-"}`);
    add(`loc:${p.location ?? "-"}`);
    // Co-occurring: pairs within this one hospital, never with an unnamed one.
    const ids = [
      ...new Set(known.map((c) => cid(c.id)).filter((id) => id !== UNMAPPED)),
    ].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    ids.forEach((a, i) => {
      add(`pa:${a}`);
      for (const b of ids.slice(i + 1)) add(`p:${a}|${b}`);
    });
    // Findings and alerts.
    const seenFindings = new Set<string>();
    let flagged = false;
    for (const x of p.findings)
      if (within(x.month)) {
        seenFindings.add(`f:${x.name ?? "-"}|${x.flag ?? "-"}`);
        if (x.flag) flagged = true;
      }
    seenFindings.forEach(add);
    if (flagged) add("fhead");
    for (const a of p.alerts)
      if (within(a.month)) {
        add("al:total");
        add(`al:${a.severity}`);
      }
    // Quality.
    for (const c of p.consultations) {
      const id = cid(c.condition);
      if (!within(c.month) || (f.condition !== null && id !== f.condition))
        continue;
      add(`q:${id}:cons`);
      add("qcons");
      add(`q:${id}:${c.confidence}`);
      if (c.agreed !== null) {
        add(`q:${id}:rated`);
        if (c.agreed) add(`q:${id}:agreed`);
        if (c.reviewer) {
          if (!reviewers.has(id)) reviewers.set(id, new Set());
          reviewers.get(id)!.add(c.reviewer);
        }
      }
      if (c.correction) {
        add(`q:${id}:corr`);
        add("qcorr");
        add(`q:${id}:${c.correction}`);
      }
    }
  }
  for (const [id, s] of reviewers) v[`q:${id}:rev`] = s.size;
  tallies.set(key, v);
  return v;
}

/** The hospital's unstandardised condition records in the months. */
function notStandardised(h: string, win: Win) {
  const key = `${h}|${win.from}-${win.to}`;
  const hit = notStdCache.get(key);
  if (hit) return hit;
  let num = 0;
  let den = 0;
  for (const p of cohortOf(h)) {
    if (!p.visits.some((m) => m >= win.from && m <= win.to)) continue;
    for (const c of p.conditions)
      if (c.onset <= win.to) {
        den++;
        if (c.id === UNMAPPED) num++;
      }
  }
  const out = { num, den };
  notStdCache.set(key, out);
  return out;
}
function notStdShare(h: string, win: Win) {
  const { num, den } = notStandardised(h, win);
  const share: AGuarded =
    den === 0
      ? { value: null, suppressed: false }
      : isSmallCount(num) || isSmallCount(den - num) || isSmallCount(den)
        ? hide()
        : { value: round(num / den, 2), suppressed: false };
  return { share, partly: den > 0 && num / den > PARTLY_ABOVE };
}

/** Adds up hospitals' figures, and counts how many hospitals have each. */
function combine(list: Rec[]): { v: Rec; hosp: Rec } {
  const v: Rec = {};
  const hosp: Rec = {};
  for (const t of list)
    for (const [k, n] of Object.entries(t)) {
      v[k] = (v[k] ?? 0) + n;
      if (n > 0) hosp[k] = (hosp[k] ?? 0) + 1;
    }
  return { v, hosp };
}

/** The view's headline: a count over a base. */
const HEADLINE: Record<ViewId, readonly [string, string]> = {
  prevalence: ["head", "seen"],
  affected: ["head", "seen"],
  "co-occurring": ["head", "seen"],
  findings: ["fhead", "seen"],
  quality: ["qcorr", "qcons"],
};

type RowInfo = { profile: Profile; ctx: Ctx };
/**
 * One entry per included hospital, hidden as the server hides them. With
 * `second`, a hospital whose shown figure would give a hidden one away is
 * hidden too; its answer is the same wherever it is read.
 */
function rowsFor(
  view: ViewId,
  f: Filters,
  map: ScopeKind,
  win: Win,
  second: boolean,
): RowInfo[] {
  const list = PROFILES.map((p) => ({ p, v: tally(p.id, map, f, win) }));
  const [head] = HEADLINE[view];
  const closed = (key: string) => {
    const raw = list.map((x) => x.v[key] ?? 0);
    const plain = raw.map(isSmallCount);
    const hidden = plain.slice();
    if (second) closeSet(raw, hidden);
    return hidden.map((h, i) => h && !plain[i]!);
  };
  const forcedHead = closed(head);
  const forcedSeen = closed("seen");
  return list.map((x, i) => ({
    profile: x.p,
    ctx: new Ctx(x.v, null, { head: forcedHead[i]!, seen: forcedSeen[i]! }),
  }));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2, 1);
};

// --- the mock ---

export function analysisMock(
  core: MockCore,
  { analysis = "normal" }: { analysis?: AnalysisMode } = {},
): AnalysisClient {
  const { now } = core;
  const off = analysis === "off";
  const trail: AccessEntry[] = seedAccess(now());

  const nameOf = (id: string) =>
    core.hospitals().find((r) => r.hospital.id === id)?.hospital.name ?? id;
  const ref = (id: string): Person => ({ id, name: nameOf(id) });
  const included = () =>
    PROFILES.map((p) => ref(p.id)).sort((a, b) => a.name.localeCompare(b.name));

  /** Platform admins only: the analysis is not for an auditor. */
  const admin = (m: TeamMember) => {
    if (m.role !== "platform_admin") fail(403, "forbidden");
  };
  const on = () => {
    if (off) fail(403, "analysis_off");
  };

  /** The months: position 11 is the last complete month before now. */
  function months(period: AnalysisPeriod) {
    const len = PERIODS[period];
    const d = new Date(now());
    const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
    const at = (pos: number) => {
      const x = new Date(last);
      x.setUTCMonth(x.getUTCMonth() - (MONTHS - 1 - pos));
      return x;
    };
    const label = (pos: number) => at(pos).toISOString().slice(0, 7);
    const win: Win = { from: MONTHS - len, to: MONTHS - 1 };
    const prev: Win | null =
      win.from - len >= 0 ? { from: win.from - len, to: win.from - 1 } : null;
    const from = at(win.from).toISOString().slice(0, 10);
    const end = at(win.to);
    const to = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);
    return { win, prev, label, period: { from, to } };
  }

  const text = (v: unknown) => (v === undefined ? null : v);
  const oneOf = <T extends string>(v: unknown, xs: readonly T[]): T =>
    typeof v === "string" && (xs as readonly string[]).includes(v)
      ? (v as T)
      : invalid();

  /** A query as the server reads it: the shape first, then the limits. */
  function check(raw: unknown): AnalysisQuery {
    if (raw === null || typeof raw !== "object") return invalid();
    const r = raw as Record<string, unknown>;
    const scope = oneOf(r.scope, ["all", "hospital"] as const);
    const period = oneOf(r.period, ["3m", "6m", "12m"] as const);
    const strOrNull = (k: string): string | null => {
      const v = text(r[k]);
      return v === null ? null : typeof v === "string" ? v : invalid();
    };
    const hospital = strOrNull("hospital");
    const q: AnalysisQuery = {
      scope,
      hospital,
      period,
      condition: strOrNull("condition"),
      age_band: strOrNull("age_band") as AnalysisQuery["age_band"],
      sex: strOrNull("sex") as Sex | null,
      setting: strOrNull("setting") as Setting | null,
      specialty: strOrNull("specialty"),
      location: strOrNull("location"),
      source: strOrNull("source"),
    };
    let profile: Profile | null = null;
    if (scope === "all") {
      if (hospital !== null) invalid();
    } else {
      if (hospital === null) invalid();
      if (EXCLUDED.some((x) => x.id === hospital)) invalid();
      profile = PROFILES.find((p) => p.id === hospital) ?? null;
      if (!profile) {
        core.findHospital(hospital!); // 404 when there is none
        invalid();
      }
    }
    if (q.sex !== null) oneOf(q.sex, SEXES);
    if (q.setting !== null) oneOf(q.setting, SETTINGS);
    if (q.specialty !== null) oneOf(q.specialty, SPECIALTIES);
    if (q.condition !== null)
      oneOf(
        q.condition,
        scope === "all"
          ? ALL_CONDITIONS.map((c) => c.id)
          : CONDITIONS.map((c) => c.id),
      );
    if (q.age_band !== null)
      oneOf(q.age_band, scope === "all" ? ALL_BANDS : HOSPITAL_BANDS);
    if (q.location !== null) {
      if (scope === "all") invalid();
      oneOf(
        q.location,
        LOCATIONS.map((l) => l.id),
      );
    }
    if (q.source !== null) {
      if (scope === "all" || profile!.sources.length < 2) invalid();
      oneOf(
        q.source,
        profile!.sources.map((s) => s.id),
      );
    }
    const filters = FILTER_KEYS.filter((k) => q[k] !== null).length;
    if (filters > MAX_FILTERS[scope]) fail(422, "too_many_filters");
    return q;
  }

  const filtersOf = (q: AnalysisQuery): Filters => ({
    condition: q.condition,
    age_band: q.age_band,
    sex: q.sex,
    setting: q.setting,
    specialty: q.specialty,
    location: q.location,
    source: q.source,
  });
  /** A one-hospital query that an all-hospitals query could also have asked. */
  const alsoAcrossHospitals = (q: AnalysisQuery) =>
    FILTER_KEYS.filter((k) => q[k] !== null).length <= MAX_FILTERS.all &&
    q.age_band === null &&
    q.location === null &&
    q.source === null &&
    (q.condition === null ||
      (ALL_CONDITIONS.some((c) => c.id === q.condition) &&
        CONDITIONS.some((c) => c.id === q.condition)));

  const refOf = (id: string, map: ScopeKind): ConditionRef =>
    (map === "all" ? ALL_CONDITIONS : CONDITIONS).find((c) => c.id === id) ??
    CONDITIONS.find((c) => c.id === UNMAPPED)!;
  const drill = (g: AGuarded) => ({ ...g, drill: null });

  /** Shown rows first, largest first; the hidden ones after. */
  function ranked<T>(
    items: T[],
    key: (t: T) => string,
    ctx: Ctx,
    tie: (t: T) => number,
  ): T[] {
    return [...items].sort((a, b) => {
      const ha = ctx.hidden(key(a));
      const hb = ctx.hidden(key(b));
      if (ha !== hb) return ha ? 1 : -1;
      return ctx.n(key(b)) - ctx.n(key(a)) || tie(a) - tie(b);
    });
  }
  const keysWith = (ctx: Ctx, prefix: string) =>
    Object.keys(ctx.v).filter((k) => k.startsWith(prefix));

  function prevalence(
    ctx: Ctx,
    q: AnalysisQuery,
    win: Win,
    label: (pos: number) => string,
  ): PrevalenceData {
    const map = q.scope;
    const order = ORDER[map] as readonly string[];
    const ids = new Set(keysWith(ctx, "c:").map((k) => k.slice(2)));
    if (q.condition) ids.add(q.condition);
    const by_condition = ranked(
      [...ids],
      (id) => `c:${id}`,
      ctx,
      (id) => order.indexOf(id),
    ).map((id) => ({
      condition: refOf(id, map),
      cases: drill(ctx.g(`c:${id}`)),
      rate: ctx.rate(`c:${id}`, "seen"),
      new: ctx.g(`n:${id}`),
    }));
    const series: PrevalenceData["series"] = [];
    for (let m = win.from; m <= win.to; m++)
      series.push({
        month: label(m),
        rate: ctx.rate(`mh:${m}`, `ms:${m}`),
        median: null,
      });
    return { by_condition, series };
  }

  function affected(ctx: Ctx, q: AnalysisQuery): AffectedData {
    /** A set of keys that adds up to the group; empty members can be left out. */
    const rows = (keys: string[], keepEmpty: boolean) => {
      const set = ctx.set(keys);
      return keys.flatMap((k, i) =>
        keepEmpty || ctx.n(k) > 0
          ? [
              {
                id: k.slice(k.indexOf(":") + 1),
                patients: drill(set[i]!),
                share: ctx.share(k, "group", set[i]!),
              },
            ]
          : [],
      );
    };
    const rest = ({ patients, share }: ReturnType<typeof rows>[number]) => ({
      patients,
      share,
    });
    const bands = q.scope === "all" ? ALL_BANDS : HOSPITAL_BANDS;
    return {
      by_age: rows(
        bands.map((b) => `age:${b}`),
        true,
      ).map((r) => ({ band: r.id, ...rest(r) })),
      by_sex: rows(
        SEXES.map((s) => `sex:${s}`),
        true,
      ).map((r) => ({ sex: r.id as Sex, ...rest(r) })),
      by_setting: rows(
        [...SETTINGS, "-"].map((s) => `set:${s}`),
        false,
      ).map((r) => ({
        setting: r.id === "-" ? null : (r.id as Setting),
        ...rest(r),
      })),
      by_specialty: rows(
        [...SPECIALTIES, "-"].map((s) => `spec:${s}`),
        false,
      ).map((r) => ({ specialty: r.id === "-" ? null : r.id, ...rest(r) })),
      by_location:
        q.scope === "all"
          ? null
          : rows(
              [...LOCATIONS.map((l) => l.id), "-"].map((l) => `loc:${l}`),
              false,
            ).map((r) => ({
              location:
                r.id === "-" ? null : LOCATIONS.find((l) => l.id === r.id)!,
              ...rest(r),
            })),
    };
  }

  function coOccurring(ctx: Ctx, q: AnalysisQuery): CoOccurringData {
    const order = ORDER[q.scope] as readonly string[];
    const pairs = keysWith(ctx, "p:").map((k) => {
      const [a, b] = k.slice(2).split("|") as [string, string];
      return { k, a, b };
    });
    const top = ranked(
      pairs,
      (p) => p.k,
      ctx,
      (p) => order.indexOf(p.a) * 100 + order.indexOf(p.b),
    ).slice(0, TOP);
    return {
      pairs: top.map((p) => ({
        a: refOf(p.a, q.scope),
        b: refOf(p.b, q.scope),
        patients: drill(ctx.g(p.k)),
        share_of_a: ctx.share(p.k, `pa:${p.a}`),
      })),
    };
  }

  function findings(ctx: Ctx): FindingsData {
    const list = keysWith(ctx, "f:").map((k) => {
      const [name, flag] = k.slice(2).split("|") as [string, string];
      return { k, name: name === "-" ? null : name, flag };
    });
    const top = ranked(
      list,
      (x) => x.k,
      ctx,
      () => 0,
    ).slice(0, TOP);
    const sev = ctx.set(["al:critical", "al:urgent", "al:info"]);
    return {
      findings: top.map((x) => ({
        name: x.name,
        flag: x.flag === "-" ? null : (x.flag as "high" | "low" | "abnormal"),
        patients: drill(ctx.g(x.k)),
        rate: ctx.rate(x.k, "seen"),
      })),
      alerts: {
        total: ctx.g("al:total"),
        by_severity: { critical: sev[0]!, urgent: sev[1]!, info: sev[2]! },
      },
    };
  }

  function quality(ctx: Ctx, q: AnalysisQuery): QualityData {
    const order = ORDER[q.scope] as readonly string[];
    const ids = keysWith(ctx, "q:")
      .filter((k) => k.endsWith(":cons"))
      .map((k) => k.slice(2, -5));
    const by_condition = ranked(
      ids,
      (id) => `q:${id}:cons`,
      ctx,
      (id) => order.indexOf(id),
    ).map((id) => {
      const p = `q:${id}:`;
      const conf = ctx.set([`${p}high`, `${p}medium`, `${p}low`]);
      const corr = ctx.set([`${p}approved`, `${p}rejected`, `${p}waiting`]);
      return {
        condition: refOf(id, q.scope),
        consultations: ctx.g(`${p}cons`),
        confidence: { high: conf[0]!, medium: conf[1]!, low: conf[2]! },
        rated: ctx.g(`${p}rated`),
        agreement_rate: ctx.share(`${p}agreed`, `${p}rated`),
        reviewers: ctx.g(`${p}rev`),
        corrections: {
          total: ctx.g(`${p}corr`),
          approved: corr[0]!,
          rejected: corr[1]!,
          waiting: corr[2]!,
        },
      };
    });
    return { by_condition };
  }

  const dataOf = (
    view: ViewId,
    ctx: Ctx,
    q: AnalysisQuery,
    win: Win,
    label: (pos: number) => string,
  ) => {
    switch (view) {
      case "prevalence":
        return prevalence(ctx, q, win, label);
      case "affected":
        return affected(ctx, q);
      case "co-occurring":
        return coOccurring(ctx, q);
      case "findings":
        return findings(ctx);
      case "quality":
        return quality(ctx, q);
    }
  };
  const headlineOf = (view: ViewId, ctx: Ctx): Rate =>
    ctx.rate(...HEADLINE[view]);

  /** The comparison for one hospital, over its fair peers. */
  function compare(
    view: ViewId,
    q: AnalysisQuery,
    own: Ctx,
    peers: RowInfo[],
    m: ReturnType<typeof months>,
  ): { comparison: Comparison; medians: AGuarded[] | null } {
    const h = profileOf(q.hospital!);
    const current = headlineOf(view, own).per_1000;
    const previous: AGuarded = m.prev
      ? headlineOf(view, new Ctx(tally(h.id, "hospital", filtersOf(q), m.prev)))
          .per_1000
      : { value: null, suppressed: false };
    const context = {
      size: own.g("seen"),
      kind: h.kind,
      coverage: h.coverage,
    };
    const no = (reason: Comparison["reason"], count: number | null = null) => ({
      comparison: {
        available: false,
        reason,
        peers: count,
        current,
        previous,
        median: hide(),
        verdict: null,
        context,
      } satisfies Comparison,
      medians: null,
    });
    if (notStdShare(h.id, m.win).partly) return no("partly_standardised");
    if (h.months < SHORT_HISTORY) return no("too_little_history");
    if (current.suppressed || current.value === null) return no("small_group");
    const fair = peers.filter(
      (x) =>
        x.profile.id !== h.id &&
        x.profile.kind === h.kind &&
        x.profile.coverage === h.coverage &&
        x.profile.months >= SHORT_HISTORY &&
        !(analysis === "few_peers" && x.profile.id === "h_ridgeway") &&
        !notStdShare(x.profile.id, m.win).partly,
    );
    const shown = fair.filter((x) => {
      const g = headlineOf(view, x.ctx).per_1000;
      return !g.suppressed && g.value !== null;
    });
    if (shown.length < MIN_PEERS) return no("too_few_peers", shown.length);
    const mid = median(
      shown.map((x) => headlineOf(view, x.ctx).per_1000.value!),
    );
    const cur = current.value;
    const verdict =
      mid === 0
        ? cur === 0
          ? "about_same"
          : "higher"
        : cur > mid * (1 + BAND)
          ? "higher"
          : cur < mid * (1 - BAND)
            ? "lower"
            : "about_same";
    const medians: AGuarded[] = [];
    for (let pos = m.win.from; pos <= m.win.to; pos++) {
      const vals = shown
        .map((x) => x.ctx.rate(`mh:${pos}`, `ms:${pos}`).per_1000)
        .filter((g) => !g.suppressed && g.value !== null)
        .map((g) => g.value!);
      medians.push(
        vals.length >= MIN_PEERS
          ? { value: median(vals), suppressed: false }
          : hide(),
      );
    }
    return {
      comparison: {
        available: true,
        reason: null,
        peers: shown.length,
        current,
        previous,
        median: { value: mid, suppressed: false },
        verdict,
        context,
      },
      medians,
    };
  }

  /** One view, from the counted cohorts. */
  function build<V extends ViewId>(view: V, q: AnalysisQuery) {
    const m = months(q.period);
    const f = filtersOf(q);
    const base = { view, scope: q.scope, updated_at: iso(now()) };
    if (q.scope === "all") {
      const rows = rowsFor(view, f, "all", m.win, true);
      const sum = combine(rows.map((r) => r.ctx.v));
      const ctx = new Ctx(sum.v, sum.hosp);
      const hospitals: HospitalRow[] = rows
        .map((r) => {
          const std = notStdShare(r.profile.id, m.win);
          return {
            hospital: ref(r.profile.id),
            size: r.ctx.g("seen"),
            kind: r.profile.kind,
            coverage: r.profile.coverage,
            not_standardised_share: std.share,
            partly_standardised: std.partly,
            headline: headlineOf(view, r.ctx),
          };
        })
        .sort((a, b) => a.hospital.name.localeCompare(b.hospital.name));
      const meta: Meta = {
        ...base,
        hospital: null,
        period: m.period,
        patients: ctx.g("group"),
        headline: headlineOf(view, ctx),
        hospitals,
        comparison: null,
      };
      return { ...meta, data: dataOf(view, ctx, q, m.win, m.label) };
    }
    const h = q.hospital!;
    // The same cell as the all-hospitals row, when that query exists.
    const together = alsoAcrossHospitals(q);
    const peers = rowsFor(
      view,
      f,
      together ? "all" : "hospital",
      m.win,
      together,
    );
    const forced = together
      ? peers.find((x) => x.profile.id === h)!.ctx.forced
      : NOT_FORCED;
    const ctx = new Ctx(tally(h, "hospital", f, m.win), null, forced);
    const data = dataOf(view, ctx, q, m.win, m.label);
    let comparison: Comparison | null = null;
    if (view === "prevalence" || view === "findings" || view === "quality") {
      const c = compare(view, q, ctx, peers, m);
      comparison = c.comparison;
      if (view === "prevalence" && c.medians) {
        const series = (data as PrevalenceData).series;
        series.forEach((s, i) => (s.median = c.medians![i]!));
      }
    }
    const meta: Meta = {
      ...base,
      hospital: ref(h),
      period: m.period,
      patients: ctx.g("group"),
      headline: headlineOf(view, ctx),
      hospitals: null,
      comparison,
    };
    return { ...meta, data };
  }

  // --- the access trail ---

  const FILTER_WORDS: Record<FilterKey, (q: AnalysisQuery) => string | null> = {
    condition: (q) =>
      q.condition === null
        ? null
        : (refOf(q.condition, q.scope).name ?? "Not standardised"),
    age_band: (q) =>
      q.age_band === null
        ? null
        : q.age_band === "80+"
          ? "80 and over"
          : q.age_band.replace("-", "–"),
    sex: (q) =>
      q.sex === null
        ? null
        : {
            female: "Female",
            male: "Male",
            other: "Other",
            not_recorded: "Not recorded",
          }[q.sex],
    setting: (q) =>
      q.setting === null
        ? null
        : {
            admitted: "Admitted",
            outpatient: "Outpatient",
            emergency: "Emergency",
          }[q.setting],
    specialty: (q) => q.specialty,
    location: (q) =>
      q.location === null
        ? null
        : (LOCATIONS.find((l) => l.id === q.location)?.label ?? null),
    source: (q) =>
      q.source === null
        ? null
        : (profileOf(q.hospital!).sources.find((s) => s.id === q.source)
            ?.label ?? null),
  };
  function record(
    m: TeamMember,
    kind: AccessKind,
    view: ViewId,
    q: AnalysisQuery,
  ) {
    const filters = FILTER_KEYS.flatMap((key) => {
      const label = FILTER_WORDS[key](q);
      return label === null ? [] : [{ key, label }];
    });
    trail.unshift({
      id: core.newId("aa"),
      at: iso(now()),
      actor: person(m),
      kind,
      scope: q.scope,
      hospital: q.hospital ? ref(q.hospital) : null,
      view,
      period: q.period,
      filters,
      count: null,
      clearance_id: null,
      flagged: false,
    });
    trail.length = Math.min(trail.length, TRAIL_MAX);
  }
  function entries(q: AccessQuery) {
    if (q.kind !== undefined && !KINDS.includes(q.kind)) invalid();
    return trail.filter(
      (e) =>
        (q.hospital === undefined || e.hospital?.id === q.hospital) &&
        (q.kind === undefined || e.kind === q.kind),
    );
  }

  const VIEW_WORDS: Record<ViewId, string> = {
    prevalence: "Prevalence and trends",
    affected: "Who is affected",
    "co-occurring": "Co-occurring conditions",
    findings: "Findings and alerts",
    quality: "MHAI quality",
  };
  const KIND_WORDS: Record<AccessKind, string> = {
    visit: "Opened Analysis",
    download: "Downloaded a CSV",
    patient_list: "Opened a patient list",
  };
  const PERIOD_WORDS: Record<AnalysisPeriod, string> = {
    "3m": "Last 3 months",
    "6m": "Last 6 months",
    "12m": "Last 12 months",
  };

  return {
    getAnalysisStatus: () =>
      core.read((m): AnalysisStatus => {
        admin(m);
        const list = included();
        return {
          aggregates_enabled: !off,
          patient_views_enabled: !off,
          sample: true,
          hospitals: {
            included: list.length,
            total: list.length + EXCLUDED.length,
            list,
            excluded: EXCLUDED.map((x) => ({
              id: x.id,
              name: nameOf(x.id),
              reason: x.reason,
            })),
          },
          my_clearances: [],
        };
      }),

    getAnalysisFilters: (scope, hospital) =>
      core.read((m): FilterOptionsOut => {
        admin(m);
        on();
        const updated_at = iso(now());
        if (scope === "all") {
          if (hospital !== null) invalid();
          return {
            updated_at,
            conditions: ALL_CONDITIONS,
            specialties: SPECIALTIES,
            locations: [],
            sources: [],
          };
        }
        if (scope !== "hospital" || hospital === null) invalid();
        if (EXCLUDED.some((x) => x.id === hospital)) invalid();
        const p = PROFILES.find((x) => x.id === hospital);
        if (!p) {
          core.findHospital(hospital!);
          invalid();
        }
        return {
          updated_at,
          conditions: CONDITIONS,
          specialties: SPECIALTIES,
          locations: LOCATIONS,
          sources: p!.sources.length > 1 ? p!.sources : [],
        };
      }),

    getAnalysisView: <V extends ViewId>(view: V, q: AnalysisQuery) =>
      core.read((m): ViewOut<V> => {
        admin(m);
        on();
        if (!VIEW_IDS.includes(view)) invalid();
        const query = check(q);
        if (typeof analysis === "object" && analysis.failView === view)
          fail(503, "unavailable");
        if (analysis === "unavailable") return { unavailable: true };
        const out = build(view, query);
        record(m, "visit", view, query);
        return out as unknown as ViewOut<V>;
      }),

    recordDownload: (body: DownloadIn, opts: WriteOpts) =>
      core.write(opts, (m) => {
        admin(m);
        on();
        const b = (body ?? {}) as Partial<DownloadIn>;
        if (!VIEW_IDS.includes(b.view as ViewId)) invalid();
        record(m, "download", b.view!, check(b.query));
      }),

    listAnalysisAccess: (q) =>
      core.read(() => {
        const rows = entries(q);
        const start = Math.max(0, Number(q.cursor) || 0);
        const end = start + PAGE;
        return {
          entries: rows.slice(start, end),
          next_cursor: end < rows.length ? String(end) : null,
        };
      }),

    async exportAnalysisAccess(q) {
      const csv = await core.read(() =>
        toCsv(
          [
            "When",
            "Who",
            "What",
            "Scope",
            "Hospital",
            "View",
            "Period",
            "Filters",
            "Count",
            "Letter",
            "Flagged",
          ],
          entries(q).map((e) => [
            e.at,
            e.actor.name,
            KIND_WORDS[e.kind],
            e.scope === "all" ? "All hospitals" : "One hospital",
            e.hospital?.name ?? "",
            VIEW_WORDS[e.view],
            PERIOD_WORDS[e.period],
            e.filters.map((x) => x.label).join("; "),
            e.count,
            e.clearance_id,
            e.flagged ? "Yes" : "No",
          ]),
        ),
      );
      return {
        filename: `mhai-analysis-access-${iso(now()).slice(0, 10)}.csv`,
        blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
      };
    },
  };
}
