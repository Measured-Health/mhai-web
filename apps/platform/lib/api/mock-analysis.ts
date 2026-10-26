// The demo's platform Analysis (Plan 12), built on the mock core. Memory
// only. Every figure is counted from the synthetic cohorts and then hidden
// the way the server must hide it (spec §5): 1 to 4 hidden; then, over one
// all-hospitals query and the same query for each hospital, every sum (a set
// and its total, or the hospitals and the all-hospitals figure) hides more
// until no subtraction gives a hidden figure away, so a hospital's figure
// reads the same in both scopes; too few hospitals; and comparisons only over
// 5 or more fair peers. It refuses what the backend refuses, with the same codes. No
// reply carries a patient: the cohorts are only ever counted.
import { ApiError } from "@mhai/api-client/errors";
import { toCsv } from "@mhai/ui/csv";
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import {
  MAX_FILTERS,
  PART_PAIRS,
  VIEW_IDS,
  type Figure,
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
  allBand,
  hospitalBand,
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

// --- hiding, the way the server must ---

type Rec = Record<string, number>;

/**
 * Counted figures, and how each is hidden: 1 to 4, too few hospitals, or
 * taken by the hiding below (`off`). `hosp` is, across hospitals, how many
 * hospitals have any cases for each key.
 */
class Ctx {
  constructor(
    readonly v: Rec,
    readonly off: ReadonlySet<string> = new Set(),
    readonly hosp: Rec | null = null,
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
    return this.off.has(k) || isSmallCount(n) || this.few(k);
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
}

/**
 * A total and the parts that add up to it, as cells: `{owner}#{key}`, where
 * the owner is `*` for all hospitals or a hospital's id. A one-part sum says
 * two cells are the same figure. `across` marks the sum of the hospitals'
 * own figures that makes an all-hospitals figure.
 */
type Sum = readonly [total: string, parts: readonly string[], across?: true];

/**
 * Hides cells until no sum gives a hidden one away. In every sum either
 * nothing is hidden, or at least two cells are and, while the total shows,
 * the hidden parts add up to 5 or more. A sum that breaks this hides its
 * next-smallest shown part (with none left, its total), and the loop runs
 * again over every sum until nothing changes. `off` only grows, so it ends.
 *
 * Hidden parts may add up to 0 (a derived rest of 0): that gives no one away.
 *
 * A figure hidden only because too few hospitals have cases (`few`) counts
 * as shown in a sum across hospitals: each of those hospitals shows its own
 * figure, so that total is never secret, and the hospitals are protected as
 * if it were known. Inside one reply it counts as hidden, so the rest of a
 * set can't give it away.
 *
 * A derived cell (`parents` gives its total and part) is never sent, but is
 * published by subtraction while both of them show: existing cases (cases −
 * new) and unrated consultations (consultations − rated). It is hidden
 * whenever either parent is, and hiding it hides its part (or, when the part
 * is 0, its total), so the loop closes it like any other cell.
 */
function closeSums(
  raw: (cell: string) => number,
  few: (cell: string) => boolean,
  sums: readonly Sum[],
  off: Set<string>,
  parents: (cell: string) => readonly [string, string] | null = () => null,
) {
  const hiddenAt = (c: string, across: boolean | undefined): boolean => {
    const from = parents(c);
    if (from && (hiddenAt(from[0], across) || hiddenAt(from[1], across)))
      return true;
    const n = raw(c);
    return n !== 0 && (off.has(c) || isSmallCount(n) || (!across && few(c)));
  };
  /** The sent cell to hide for a cell: itself, or a derived cell's parent. */
  const target = (c: string) => {
    const from = parents(c);
    if (!from) return c;
    return raw(from[1]) > 0 ? from[1] : from[0];
  };
  /** Hidden only for too few hospitals (inside a reply). */
  const fewOnly = (c: string) => {
    if (parents(c)) return false;
    const n = raw(c);
    return n !== 0 && !off.has(c) && !isSmallCount(n) && few(c);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const [total, parts, across] of sums) {
      const hidden = (c: string) => hiddenAt(c, across);
      const hid = parts.filter(hidden);
      if (!across && fewOnly(total)) {
        // The rows may add up to it (the reader then knows it): close the
        // set as under a shown total, and keep a member hidden besides.
        const sum = hid.reduce((s, c) => s + raw(c), 0);
        // Hidden parts that add up to 0 give no one away (a rest can be 0).
        if (sum === 0 || (hid.length >= 2 && sum >= SMALL_GROUP_MIN)) continue;
      } else if (hidden(total)) {
        if (hid.length > 0) continue;
      } else {
        if (hid.length === 0) continue;
        const sum = hid.reduce((s, c) => s + raw(c), 0);
        // Hidden parts that add up to 0 give no one away (a rest can be 0).
        if (sum === 0 || (hid.length >= 2 && sum >= SMALL_GROUP_MIN)) continue;
      }
      let next: string | null = null;
      for (const c of parts)
        if (!hidden(c) && raw(c) > 0 && (next === null || raw(c) < raw(next)))
          next = c;
      if (next === null && hidden(total)) continue;
      off.add(target(next ?? total));
      changed = true;
    }
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
    // Rows of two breakdowns at once, to find one row wholly inside another.
    const rows = [
      `age:${band(p.age)}`,
      `sex:${p.sex}`,
      `set:${p.setting ?? "-"}`,
      `spec:${p.specialty ?? "-"}`,
      ...(map === "hospital" ? [`loc:${p.location ?? "-"}`] : []),
    ];
    rows.forEach((a, i) => {
      for (const b of rows.slice(i + 1)) add(crossKey(a, b));
    });
    // A setting's patients with no recorded ward: never sent, but its wards
    // leave them by subtraction.
    if (map === "hospital" && p.setting && !p.location) add(`lx:${p.setting}`);
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
      add(`q:${id}:${c.confidence}`);
      if (c.agreed !== null) {
        add(`q:${id}:rated`);
        add("qrated");
        if (c.agreed) {
          add(`q:${id}:agreed`);
          add("qagreed");
        }
        if (c.reviewer) {
          if (!reviewers.has(id)) reviewers.set(id, new Set());
          reviewers.get(id)!.add(c.reviewer);
        }
      }
      if (c.correction) {
        add(`q:${id}:corr`);
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

/**
 * The view's headline: a count over a base. Quality's is the agreement
 * rate: ratings the reviewers agreed with, over ratings.
 */
const HEADLINE: Record<ViewId, readonly [string, string]> = {
  prevalence: ["head", "seen"],
  affected: ["head", "seen"],
  "co-occurring": ["head", "seen"],
  findings: ["fhead", "seen"],
  quality: ["qagreed", "qrated"],
};
/** What an all-hospitals row shows for its hospital, in any view. */
const ROW_KEYS = new Set(["seen", ...Object.values(HEADLINE).flat()]);

const keysWith = (ctx: Ctx, prefix: string) =>
  Object.keys(ctx.v).filter((k) => k.startsWith(prefix));

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
/** The pairs a reply lists: at most 20, the hidden ones last. */
function topPairs(ctx: Ctx, map: ScopeKind) {
  const order = ORDER[map] as readonly string[];
  const pairs = keysWith(ctx, "p:").map((k) => {
    const [a, b] = k.slice(2).split("|") as [string, string];
    return { k, a, b };
  });
  return ranked(
    pairs,
    (p) => p.k,
    ctx,
    (p) => order.indexOf(p.a) * 100 + order.indexOf(p.b),
  ).slice(0, TOP);
}
/** The findings a reply lists: at most 20, the hidden ones last. */
function topFindings(ctx: Ctx) {
  const list = keysWith(ctx, "f:").map((k) => {
    const [name, flag] = k.slice(2).split("|") as [string, string];
    return { k, name: name === "-" ? null : name, flag };
  });
  return ranked(
    list,
    (x) => x.k,
    ctx,
    () => 0,
  ).slice(0, TOP);
}

const pairKey = (a: string, b: string, map: ScopeKind) => {
  const order = ORDER[map] as readonly string[];
  return order.indexOf(a) < order.indexOf(b) ? `p:${a}|${b}` : `p:${b}|${a}`;
};

/**
 * The sums inside one reply's figures (one hospital's, or all hospitals'),
 * keys in that scope's names. `condition` is the filter, if any.
 */
/**
 * The rest of a part-pair (`PART_PAIRS`): `r:{part}~{whole}`, whole − part.
 * The two shown together publish it by subtraction, so it is a derived cell
 * (see closeSums), worked out from its parents, never stored.
 */
const restKey = (part: string, whole: string) => `r:${part}~${whole}`;
function restOf(k: string): { count: string; base: string } | null {
  if (!k.startsWith("r:")) return null;
  const at = k.lastIndexOf("~");
  return { count: k.slice(2, at), base: k.slice(at + 1) };
}

type Item = { item: string; key: string; flagged: boolean; within?: string };
/** A figure's cells in one owner's counts, item by item. */
function figureCells(view: ViewId, f: Figure, v: Rec, map: ScopeKind): Item[] {
  const one = (key: string): Item[] => [{ item: "", key, flagged: false }];
  const keys = (prefix: string) =>
    Object.keys(v).filter((k) => k.startsWith(prefix));
  const each = (
    prefix: string,
    to: (id: string) => string = (id) => prefix + id,
  ) =>
    keys(prefix).map((k) => {
      const id = k.slice(prefix.length);
      return { item: id, key: to(id), flagged: false };
    });
  const qids = keys("q:")
    .filter((k) => k.endsWith(":cons"))
    .map((k) => k.slice(2, -5));
  switch (f) {
    case "patients":
      return one("group");
    case "headline.count":
    case "row.count":
      return one(HEADLINE[view][0]);
    case "headline.base":
    case "row.base":
      return one(HEADLINE[view][1]);
    case "row.size":
      return one("seen");
    case "series.base":
      return each("ms:");
    case "series.count":
      return each("ms:", (m) => `mh:${m}`);
    case "condition.cases":
      return each("c:");
    case "condition.new":
      return each("c:", (id) => `n:${id}`);
    case "member.patients":
      return ["age:", "sex:", "spec:"]
        .flatMap((p) => keys(p))
        .map((k) => ({ item: k, key: k, flagged: false }));
    case "setting.patients":
      return keys("set:").map((k) => ({ item: k, key: k, flagged: false }));
    case "ward.patients": {
      if (map !== "hospital") return [];
      return keys("loc:").map((k) => {
        const s = LOCATIONS.find((l) => `loc:${l.id}` === k)?.setting;
        const it: Item = { item: k, key: k, flagged: false };
        if (s) it.within = `set:${s}`;
        return it;
      });
    }
    case "pair.patients":
      return keys("p:").map((k) => ({ item: k, key: k, flagged: false }));
    case "finding.patients":
      return keys("f:").map((k) => ({
        item: k,
        key: k,
        flagged: !k.endsWith("|-"),
      }));
    case "quality.consultations":
      return qids.map((id) => ({
        item: id,
        key: `q:${id}:cons`,
        flagged: false,
      }));
    case "quality.rated":
      return qids.map((id) => ({
        item: id,
        key: `q:${id}:rated`,
        flagged: false,
      }));
    case "quality.corrections":
      return qids.map((id) => ({
        item: id,
        key: `q:${id}:corr`,
        flagged: false,
      }));
  }
}
const isRowFigure = (f: Figure) => f.startsWith("row.");

/**
 * Every part-pair of every view over one owner's counts, as sums: the whole
 * is its part and the rest. `rows` picks the hospital-row pairs only (a
 * hospital with no reply of its own), or every other pair.
 */
function pairSums(v: Rec, map: ScopeKind, rows: boolean): Sum[] {
  const out = new Map<string, Sum>();
  for (const view of VIEW_IDS)
    for (const p of PART_PAIRS[view]) {
      if (isRowFigure(p.whole) !== rows) continue;
      const wholes = figureCells(view, p.whole, v, map);
      const same = !rows && wholes.length > 0 && wholes[0]!.item !== "";
      for (const part of figureCells(view, p.part, v, map)) {
        if (p.only === "flagged" && !part.flagged) continue;
        const whole = p.within
          ? wholes.find((w) => w.item === part.within)
          : same
            ? wholes.find((w) => w.item === part.item)
            : wholes[0];
        if (!whole || whole.key === part.key) continue;
        const rk = restKey(part.key, whole.key);
        out.set(rk, [whole.key, [part.key, rk]]);
      }
    }
  return [...out.values()];
}

/** Patients in two breakdown rows (of different breakdowns) at once. */
const crossKey = (a: string, b: string) => `x:${a}&${b}`;
const CROSS_DIMS = ["age:", "sex:", "set:", "spec:", "loc:"] as const;

/**
 * A row wholly inside a row of another breakdown in these counts (a
 * children's ward inside 0–17, a specialty seen by one sex): the two shown
 * together leave the rest by subtraction, so it is a part-pair rest too.
 * This is in the data, not the contract, so the reader can't know it; the
 * sample (like the server) finds and closes it. A ward inside its own
 * setting is a declared pair as well; "no setting" inside "no ward" is not.
 */
function containedSums(v: Rec, map: ScopeKind): Sum[] {
  const dims = CROSS_DIMS.filter((d) => map === "hospital" || d !== "loc:");
  const rows = dims.map((d) =>
    Object.keys(v).filter((k) => k.startsWith(d) && (v[k] ?? 0) > 0),
  );
  const out: Sum[] = [];
  rows.forEach((as, i) => {
    for (const bs of rows.slice(i + 1))
      for (const a of as)
        for (const b of bs) {
          const both = v[crossKey(a, b)] ?? 0;
          for (const [part, whole] of [
            [a, b],
            [b, a],
          ] as const)
            if (both === v[part] && v[whole]! > v[part]!)
              out.push([whole, [part, restKey(part, whole)]]);
        }
  });
  return out;
}

function sumsOf(v: Rec, map: ScopeKind, condition: string | null): Sum[] {
  const bands = map === "all" ? ALL_BANDS : HOSPITAL_BANDS;
  const out: Sum[] = [
    ["group", bands.map((b) => `age:${b}`)],
    ["group", SEXES.map((s) => `sex:${s}`)],
    ["group", [...SETTINGS, "-"].map((s) => `set:${s}`)],
    ["group", [...SPECIALTIES, "-"].map((s) => `spec:${s}`)],
    ["al:total", ["al:critical", "al:urgent", "al:info"]],
  ];
  if (map === "hospital") {
    out.push([
      "group",
      [...LOCATIONS.map((l) => l.id), "-"].map((l) => `loc:${l}`),
    ]);
    // A setting's row is its wards and its patients with no ward.
    for (const s of SETTINGS) {
      const wards = LOCATIONS.filter((l) => l.setting === s);
      if (wards.length > 0)
        out.push([`set:${s}`, [...wards.map((l) => `loc:${l.id}`), `lx:${s}`]]);
    }
  }
  const ids = Object.keys(v)
    .filter((k) => k.startsWith("q:") && k.endsWith(":cons"))
    .map((k) => k.slice(2, -5));
  for (const id of ids) {
    const p = `q:${id}:`;
    out.push(
      [`${p}cons`, [`${p}high`, `${p}medium`, `${p}low`]],
      [`${p}corr`, [`${p}approved`, `${p}rejected`, `${p}waiting`]],
    );
  }
  out.push(
    ["qrated", ids.map((id) => `q:${id}:rated`)],
    ["qagreed", ids.map((id) => `q:${id}:agreed`)],
  );
  // A whole shown beside its part publishes the rest (PART_PAIRS).
  out.push(...pairSums(v, map, false));
  out.push(...containedSums(v, map));
  // The same figure under two names.
  const pa = Object.keys(v).filter((k) => k.startsWith("pa:"));
  if (condition === null) {
    out.push(["seen", ["group"]]);
    for (const k of pa) out.push([k, [`c:${k.slice(3)}`]]);
  } else {
    out.push(["group", ["head"]], ["group", [`c:${condition}`]]);
    if (condition !== UNMAPPED)
      for (const k of pa) {
        const a = k.slice(3);
        out.push([k, [a === condition ? "group" : pairKey(a, condition, map)]]);
      }
  }
  return out;
}

/** A hospital's own condition id for an all-hospitals one. */
const HOSPITAL_ID = new Map(CONDITIONS.map((c) => [allId(c.id), c.id]));
/**
 * The one-hospital key for an all-hospitals key, or null when One hospital
 * has no such figure (the 20-year age bands but the last).
 */
function hospitalKey(k: string): string | null {
  const rest = restOf(k);
  if (rest) {
    const count = hospitalKey(rest.count);
    const base = hospitalKey(rest.base);
    return count === null || base === null ? null : restKey(count, base);
  }
  const [head, a = "", b = ""] = k.split(":");
  const id = (x: string) => HOSPITAL_ID.get(x) ?? x;
  switch (head) {
    case "c":
    case "n":
    case "pa":
      return `${head}:${id(a)}`;
    case "p": {
      const [x, y] = a.split("|") as [string, string];
      return `p:${id(x)}|${id(y)}`;
    }
    case "q":
      return `q:${id(a)}:${b}`;
    case "age":
      return k === "age:80+" ? k : null;
    case "loc":
    case "lx":
    case "x":
      return null;
    default:
      return k;
  }
}

type Owner = {
  id: string;
  v: Rec;
  map: ScopeKind;
  hosp: Rec | null;
  /** Whether it has a reply of its own, with lists cut at 20. */
  lists: boolean;
};
const cellOf = (owner: string, key: string) => `${owner}#${key}`;

/**
 * Hides every owner's figures together, until no sum (inside one reply, or
 * across hospitals) gives a hidden figure away. A pair or finding cut from a
 * list of 20 is not shown either, so it counts as hidden, and the sums run
 * again until the lists stop changing.
 */
function hideTogether(owners: Owner[], sums: Sum[]): Map<string, Ctx> {
  const byId = new Map(owners.map((o) => [o.id, o]));
  const split = (c: string) => {
    const at = c.indexOf("#");
    return [byId.get(c.slice(0, at))!, c.slice(at + 1)] as const;
  };
  const raw = (c: string) => {
    const [o, k] = split(c);
    const rest = restOf(k);
    if (rest) return (o.v[rest.base] ?? 0) - (o.v[rest.count] ?? 0);
    return o.v[k] ?? 0;
  };
  // A complement is hidden through its parents, never for itself.
  const few = (c: string) => {
    const [o, k] = split(c);
    if (restOf(k)) return false;
    return o.hosp !== null && (o.hosp[k] ?? 0) < MIN_HOSPITALS;
  };
  for (const [total, parts] of sums)
    if (parts.reduce((s, c) => s + raw(c), 0) !== raw(total))
      throw new Error(`analysis sample: ${total} doesn't add up`);
  const off = new Set<string>();
  const ctxs = () =>
    new Map(
      owners.map((o) => {
        const mine = new Set<string>();
        for (const c of off)
          if (c.startsWith(`${o.id}#`)) mine.add(c.slice(o.id.length + 1));
        return [o.id, new Ctx(o.v, mine, o.hosp)] as const;
      }),
    );
  /** A derived cell's total and part, in the same owner. */
  const parents = (c: string): readonly [string, string] | null => {
    const at = c.indexOf("#");
    const owner = c.slice(0, at + 1);
    const k = c.slice(at + 1);
    const rest = restOf(k);
    if (rest) return [`${owner}${rest.base}`, `${owner}${rest.count}`];
    return null;
  };
  for (;;) {
    closeSums(raw, few, sums, off, parents);
    const now = ctxs();
    let cut = false;
    for (const o of owners) {
      if (!o.lists) continue;
      const ctx = now.get(o.id)!;
      const listed = new Set([
        ...topPairs(ctx, o.map).map((p) => p.k),
        ...topFindings(ctx).map((x) => x.k),
      ]);
      for (const k of [...keysWith(ctx, "p:"), ...keysWith(ctx, "f:")])
        if (!listed.has(k) && !off.has(cellOf(o.id, k))) {
          off.add(cellOf(o.id, k));
          cut = true;
        }
    }
    if (!cut) return now;
  }
}
const inCells = (owner: string, sums: Sum[]): Sum[] =>
  sums.map(([t, parts]) => [
    cellOf(owner, t),
    parts.map((p) => cellOf(owner, p)),
  ]);

/** The one-hospital filters that ask the same as all-hospitals ones. */
function twinOf(f: Filters): Filters | null {
  if (f.age_band !== null && f.age_band !== "80+") return null;
  if (f.condition === null) return f;
  const id = HOSPITAL_ID.get(f.condition);
  return id === undefined ? null : { ...f, condition: id };
}

type Family = { all: Ctx; hospitals: Map<string, Ctx> };
const families = new Map<string, Family>();
/**
 * One all-hospitals query and, where they exist, the same query for each
 * hospital in One hospital scope, hidden together. A hospital's figure is
 * one cell, read the same in both scopes and in every view; the all-
 * hospitals figure is the sum of those cells. Without a one-hospital twin
 * (a 20-year age band), a hospital's only figures are its row's.
 */
function familyOf(f: Filters, win: Win): Family {
  const key = `${JSON.stringify(f)}|${win.from}-${win.to}`;
  const hit = families.get(key);
  if (hit) return hit;
  const twin = twinOf(f);
  const sum = combine(PROFILES.map((p) => tally(p.id, "all", f, win)));
  const owners: Owner[] = [
    { id: "*", v: sum.v, map: "all", hosp: sum.hosp, lists: true },
    ...PROFILES.map((p) => ({
      id: p.id,
      v: twin ? tally(p.id, "hospital", twin, win) : tally(p.id, "all", f, win),
      map: (twin ? "hospital" : "all") as ScopeKind,
      hosp: null,
      lists: twin !== null,
    })),
  ];
  const sums = inCells("*", sumsOf(sum.v, "all", f.condition));
  if (twin)
    for (const p of PROFILES)
      sums.push(
        ...inCells(
          p.id,
          sumsOf(
            tally(p.id, "hospital", twin, win),
            "hospital",
            twin.condition,
          ),
        ),
      );
  // Without a twin a hospital's only figures are its row's: the row pairs.
  if (!twin)
    for (const p of PROFILES)
      sums.push(
        ...inCells(p.id, pairSums(tally(p.id, "all", f, win), "all", true)),
      );
  // Each all-hospitals figure, and each rest, is the sum of the hospitals' own.
  const across = [
    ...Object.keys(sum.v),
    ...pairSums(sum.v, "all", false).map(([, parts]) => parts[1]!),
  ];
  for (const k of across) {
    const rest = restOf(k);
    const row = rest
      ? ROW_KEYS.has(rest.count) && ROW_KEYS.has(rest.base)
      : ROW_KEYS.has(k);
    const hk = twin ? hospitalKey(k) : row ? k : null;
    if (hk === null) continue;
    sums.push([cellOf("*", k), PROFILES.map((p) => cellOf(p.id, hk)), true]);
  }
  const ctxs = hideTogether(owners, sums);
  const out: Family = {
    all: ctxs.get("*")!,
    hospitals: new Map(PROFILES.map((p) => [p.id, ctxs.get(p.id)!])),
  };
  families.set(key, out);
  return out;
}

const alone = new Map<string, Ctx>();
/** A one-hospital query with no all-hospitals twin: its own sums only. */
function aloneOf(h: string, f: Filters, win: Win): Ctx {
  const key = `${h}|${JSON.stringify(f)}|${win.from}-${win.to}`;
  const hit = alone.get(key);
  if (hit) return hit;
  const v = tally(h, "hospital", f, win);
  const ctx = hideTogether(
    [{ id: h, v, map: "hospital", hosp: null, lists: true }],
    inCells(h, sumsOf(v, "hospital", f.condition)),
  ).get(h)!;
  alone.set(key, ctx);
  return ctx;
}

type RowInfo = { profile: Profile; ctx: Ctx };

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
  /** The all-hospitals filters that ask the same as a one-hospital query. */
  const acrossOf = (q: AnalysisQuery): Filters | null => {
    const set = FILTER_KEYS.filter((k) => q[k] !== null).length;
    if (set > MAX_FILTERS.all || q.location !== null || q.source !== null)
      return null;
    if (q.age_band !== null && q.age_band !== "80+") return null;
    const f = filtersOf(q);
    if (q.condition === null) return f;
    const id = allId(q.condition);
    return ALL_CONDITIONS.some((c) => c.id === id) &&
      HOSPITAL_ID.get(id) === q.condition
      ? { ...f, condition: id }
      : null;
  };

  const refOf = (id: string, map: ScopeKind): ConditionRef =>
    (map === "all" ? ALL_CONDITIONS : CONDITIONS).find((c) => c.id === id) ??
    CONDITIONS.find((c) => c.id === UNMAPPED)!;
  const drill = (g: AGuarded) => ({ ...g, drill: null });

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
      const set = keys.map((k) => ctx.g(k));
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
    return {
      pairs: topPairs(ctx, q.scope).map((p) => ({
        a: refOf(p.a, q.scope),
        b: refOf(p.b, q.scope),
        patients: drill(ctx.g(p.k)),
        share_of_a: ctx.share(p.k, `pa:${p.a}`),
      })),
    };
  }

  function findings(ctx: Ctx): FindingsData {
    const sev = ["al:critical", "al:urgent", "al:info"].map((k) => ctx.g(k));
    return {
      findings: topFindings(ctx).map((x) => ({
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
      const conf = ["high", "medium", "low"].map((k) => ctx.g(p + k));
      const corr = ["approved", "rejected", "waiting"].map((k) => ctx.g(p + k));
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
      const fam = familyOf(f, m.win);
      const ctx = fam.all;
      const hospitals: HospitalRow[] = PROFILES.map((p) => {
        const own = fam.hospitals.get(p.id)!;
        const std = notStdShare(p.id, m.win);
        return {
          hospital: ref(p.id),
          size: own.g("seen"),
          kind: p.kind,
          coverage: p.coverage,
          not_standardised_share: std.share,
          partly_standardised: std.partly,
          headline: headlineOf(view, own),
        };
      }).sort((a, b) => a.hospital.name.localeCompare(b.hospital.name));
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
    // The same cells as the all-hospitals query that asks the same, if any.
    const across = acrossOf(q);
    const fam = across ? familyOf(across, m.win) : null;
    const ctxOf = (id: string) =>
      fam ? fam.hospitals.get(id)! : aloneOf(id, f, m.win);
    const peers: RowInfo[] = PROFILES.map((p) => ({
      profile: p,
      ctx: ctxOf(p.id),
    }));
    const ctx = ctxOf(h);
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
