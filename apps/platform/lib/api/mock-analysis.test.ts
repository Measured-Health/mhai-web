import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { VENDOR_NAMES } from "../../../../scripts/vendor-names.mjs";
import {
  VIEW_IDS,
  type AGuarded,
  type AffectedData,
  type AnalysisPeriod,
  type AnalysisQuery,
  type CoOccurringData,
  type FindingsData,
  type Meta,
  type PrevalenceData,
  type QualityData,
  type ViewId,
  type ViewOut,
} from "./analysis-contract";
import {
  ALL_CONDITIONS,
  CONDITIONS,
  LOCATIONS,
  PROFILES,
  SPECIALTIES,
  allId,
  buildCohort,
  cohortOf,
} from "./analysis-fixtures";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";

const START = Date.parse("2026-10-23T09:30:00.000Z");
const HOUR = 3_600_000;
let n = 0;
const KEY = () => ({ idempotencyKey: `an-${++n}` });

type Option = NonNullable<Parameters<typeof createMockPlatform>[0]>["analysis"];
function setup(over: { email?: string | null; analysis?: Option } = {}) {
  let t = START;
  let me = over.email === undefined ? TEAM_EMAILS.ada : over.email;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    analysis: over.analysis,
  });
  return {
    m,
    as: (e: string | null) => void (me = e),
    advance: (ms: number) => void (t += ms),
  };
}
type Mock = ReturnType<typeof setup>["m"];

async function failure(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
  throw new Error("expected a refusal");
}

const ALL: AnalysisQuery = {
  scope: "all",
  hospital: null,
  period: "12m",
  condition: null,
  age_band: null,
  sex: null,
  setting: null,
  specialty: null,
  location: null,
  source: null,
};
const all = (over: Partial<AnalysisQuery> = {}): AnalysisQuery => ({
  ...ALL,
  ...over,
});
const one = (
  hospital: string,
  over: Partial<AnalysisQuery> = {},
): AnalysisQuery => ({ ...ALL, scope: "hospital", hospital, ...over });

type Full<V extends ViewId> = Extract<ViewOut<V>, { view?: unknown }> &
  Meta & { data: unknown };
async function view<V extends ViewId>(m: Mock, v: V, q: AnalysisQuery) {
  const out = await m.getAnalysisView(v, q);
  if ("unavailable" in out) throw new Error("unavailable");
  return out as unknown as Meta & {
    data: Extract<ViewOut<V>, { data: unknown }>["data"];
  };
}
const rowOf = (meta: Meta, id: string) =>
  meta.hospitals!.find((r) => r.hospital.id === id)!;
void ({} as Full<"prevalence">);

/** Every `{value, suppressed}` in a reply, with the key it sits under. */
function guarded(x: unknown, key = "", out: [string, AGuarded][] = []) {
  if (Array.isArray(x)) x.forEach((v) => guarded(v, key, out));
  else if (x !== null && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if ("suppressed" in o && "value" in o) out.push([key, o as AGuarded]);
    else for (const [k, v] of Object.entries(o)) guarded(v, k, out);
  }
  return out;
}
/** Keys whose value is a number of patients, findings, alerts or reviews. */
const COUNTS = new Set([
  "count",
  "base",
  "size",
  "patients",
  "cases",
  "new",
  "total",
  "consultations",
  "rated",
  "reviewers",
  "approved",
  "rejected",
  "waiting",
  "critical",
  "urgent",
  "info",
  "high",
  "medium",
  "low",
]);

describe("the sample cohorts", () => {
  it("are the same every time, from 120 to 1,400 patients", () => {
    for (const p of PROFILES) {
      expect(JSON.stringify(buildCohort(p))).toBe(
        JSON.stringify(buildCohort(p)),
      );
      expect(cohortOf(p.id).length).toBe(p.patients);
      expect(p.patients).toBeGreaterThanOrEqual(120);
      expect(p.patients).toBeLessThanOrEqual(1400);
    }
    const sizes = PROFILES.map((p) => p.patients);
    expect(Math.min(...sizes)).toBe(120);
    expect(Math.max(...sizes)).toBe(1400);
  });

  it("plant the cases the rules need", () => {
    const has = (h: string, id: string) =>
      cohortOf(h).filter((p) => p.conditions.some((c) => c.id === id)).length;
    expect(has("h_lakeside", "d57")).toBe(3);
    expect(has("h_harbour", "d57")).toBe(6);
    const tb = PROFILES.filter((p) => has(p.id, "a15") > 0).map((p) => p.id);
    expect(tb.sort()).toEqual(["h_havana", "h_northgate"]);
    const pair = PROFILES.flatMap((p) =>
      cohortOf(p.id).filter((x) => {
        const ids = x.conditions.map((c) => c.id);
        return ids.includes("a15") && ids.includes("n18");
      }),
    );
    expect(pair).toHaveLength(2);
  });

  it("name no vendor, and carry no lab wording or patient field", () => {
    const text = JSON.stringify(
      PROFILES.map((p) => cohortOf(p.id)),
    ).toLowerCase();
    for (const v of VENDOR_NAMES) expect(text).not.toContain(v);
    expect(text).not.toMatch(/\blab\b/);
    expect(text).not.toMatch(/"(pid|mrn|dob|address|patient_name)"/);
  });
});

describe("the status", () => {
  it("is 10 of 12 included; Hilltop not covered; Eastbrook not enough data", async () => {
    const { m } = setup();
    const s = await m.getAnalysisStatus();
    expect(s).toMatchObject({
      aggregates_enabled: true,
      patient_views_enabled: true,
      sample: true,
      my_clearances: [],
    });
    expect(s.hospitals.included).toBe(10);
    expect(s.hospitals.total).toBe(12);
    expect(s.hospitals.list).toHaveLength(10);
    expect(s.hospitals.list.map((h) => h.id)).not.toContain("h_hilltop");
    expect(s.hospitals.list.map((h) => h.id)).not.toContain("h_eastbrook");
    expect(s.hospitals.excluded).toEqual([
      {
        id: "h_hilltop",
        name: "Hilltop Cottage Hospital",
        reason: "not_covered",
      },
      {
        id: "h_eastbrook",
        name: "Eastbrook Medical Centre",
        reason: "not_enough_data",
      },
    ]);
  });

  it("says off when the switch is off", async () => {
    const { m } = setup({ analysis: "off" });
    const s = await m.getAnalysisStatus();
    expect(s.aggregates_enabled).toBe(false);
    expect(s.patient_views_enabled).toBe(false);
    expect(await failure(m.getAnalysisView("prevalence", all()))).toEqual([
      403,
      "analysis_off",
    ]);
    expect(await failure(m.getAnalysisFilters("all", null))).toEqual([
      403,
      "analysis_off",
    ]);
  });
});

describe("the filter options", () => {
  it("across hospitals: 3-character conditions, no wards or sources", async () => {
    const f = await setup().m.getAnalysisFilters("all", null);
    expect(f.conditions.map((c) => c.id)).toEqual([
      "e11",
      "n18",
      "i10",
      "b54",
      "j18",
      "d57",
      "j45",
      "a15",
    ]);
    for (const c of f.conditions) expect(c.icd10).toHaveLength(3);
    expect(f.locations).toEqual([]);
    expect(f.sources).toEqual([]);
    expect(f.specialties.length).toBeGreaterThan(5);
  });

  it("for one hospital: its wards, and sources only when it has more than one", async () => {
    const { m } = setup();
    const havana = await m.getAnalysisFilters("hospital", "h_havana");
    expect(havana.sources.map((s) => s.label)).toEqual([
      "Main record",
      "Results system",
    ]);
    expect(havana.locations.length).toBeGreaterThan(2);
    expect(havana.conditions.map((c) => c.id)).toContain("j18_9");
    expect(havana.conditions.map((c) => c.id)).toContain("unmapped");
    expect(
      (await m.getAnalysisFilters("hospital", "h_westfield")).sources,
    ).toEqual([]);
    expect(
      await failure(m.getAnalysisFilters("hospital", "h_hilltop")),
    ).toEqual([422, "invalid"]);
    expect(await failure(m.getAnalysisFilters("hospital", null))).toEqual([
      422,
      "invalid",
    ]);
  });
});

describe("hiding small groups", () => {
  it("hides counts 1 to 4 and shows 0", async () => {
    const { m } = setup();
    const small = await view(
      m,
      "prevalence",
      one("h_lakeside", { condition: "d57" }),
    );
    expect(small.patients).toEqual({ value: null, suppressed: true });
    expect(small.headline.count).toEqual({ value: null, suppressed: true });
    expect(small.headline.per_1000.suppressed).toBe(true);
    const zero = await view(
      m,
      "prevalence",
      one("h_riverside", { condition: "a15" }),
    );
    expect(zero.patients).toEqual({ value: 0, suppressed: false });
    expect(zero.headline.count).toEqual({ value: 0, suppressed: false });
  });

  it("hides a rate or share over a hidden or near-total group", async () => {
    const { m } = setup();
    const out = await view(m, "affected", one("h_lakeside", { period: "3m" }));
    const data = out.data;
    for (const row of [...data.by_age, ...data.by_sex])
      if (row.patients.suppressed) expect(row.share.suppressed).toBe(true);
    for (const row of data.by_age)
      expect(row.patients.drill, "no drill in 12a").toBeNull();
  });

  it("hides the next smallest set member when the rest give one away", async () => {
    const { m } = setup();
    // A set of 5 age bands: whichever one member is hidden, a second goes too.
    for (const q of [
      one("h_lakeside"),
      one("h_fairhaven", { period: "3m" }),
      one("h_havana", { sex: "other", period: "3m" }),
    ]) {
      const { data } = await view(m, "affected", q);
      const rows = [
        data.by_age.map((r) => r.patients),
        data.by_sex.map((r) => r.patients),
      ];
      for (const set of rows) {
        const hiddenN = set.filter((g) => g.suppressed).length;
        expect(hiddenN === 1, JSON.stringify(q)).toBe(false);
      }
    }
  });

  it("Sickle cell disease hides Lakeside (3) and then Harbour View (6): second hiding", async () => {
    const { m } = setup();
    const out = await view(m, "prevalence", all({ condition: "d57" }));
    const rows = out.hospitals!;
    expect(rows).toHaveLength(10);
    const lake = rowOf(out, "h_lakeside").headline.count;
    const harbour = rowOf(out, "h_harbour").headline.count;
    expect(lake).toEqual({ value: null, suppressed: true });
    expect(harbour).toEqual({ value: null, suppressed: true });
    // Everyone else shows, so the all-hospitals figure is shown...
    for (const r of rows)
      if (!["h_lakeside", "h_harbour"].includes(r.hospital.id))
        expect(r.headline.count.suppressed, r.hospital.id).toBe(false);
    expect(out.headline.count.suppressed).toBe(false);
    // ...and what the shown rows leave is 9, not 3.
    const shown = rows.reduce((s, r) => s + (r.headline.count.value ?? 0), 0);
    expect(out.headline.count.value! - shown).toBe(9);
    // The per-1,000 of a hidden row is hidden too.
    expect(rowOf(out, "h_harbour").headline.per_1000.suppressed).toBe(true);
  });

  it("Sickle cell disease is hidden for Harbour View in one hospital too: the same answer in both scopes", async () => {
    const { m } = setup();
    const hv = await view(
      m,
      "prevalence",
      one("h_harbour", { condition: "d57" }),
    );
    expect(hv.patients.suppressed).toBe(true);
    expect(hv.headline.count.suppressed).toBe(true);
    for (const row of hv.data.by_condition) {
      expect(row.cases.suppressed).toBe(true);
      expect(row.rate.per_1000.suppressed).toBe(true);
    }
    const westfield = await view(
      m,
      "prevalence",
      one("h_westfield", { condition: "d57" }),
    );
    expect(westfield.headline.count.suppressed).toBe(false);
  });

  it("Tuberculosis across hospitals reads too_few_hospitals", async () => {
    const { m } = setup();
    const out = await view(m, "prevalence", all({ condition: "a15" }));
    expect(out.headline.count).toEqual({
      value: null,
      suppressed: true,
      why: "too_few_hospitals",
    });
    expect(out.patients).toMatchObject({
      suppressed: true,
      why: "too_few_hospitals",
    });
    expect(out.data.by_condition[0]!.cases).toMatchObject({
      suppressed: true,
      why: "too_few_hospitals",
    });
    // The two hospitals' own rows show (each is 5 or more).
    expect(rowOf(out, "h_havana").headline.count).toEqual({
      value: 9,
      suppressed: false,
    });
    expect(rowOf(out, "h_northgate").headline.count).toEqual({
      value: 6,
      suppressed: false,
    });
    // Without a filter, the Tuberculosis line reads the same.
    const plain = await view(m, "prevalence", all());
    const tb = plain.data.by_condition.find((c) => c.condition.id === "a15")!;
    expect(tb.cases).toMatchObject({
      suppressed: true,
      why: "too_few_hospitals",
    });
    // In one hospital the figure is its own, so it shows.
    const havana = await view(
      m,
      "prevalence",
      one("h_havana", { condition: "a15" }),
    );
    expect(havana.patients).toEqual({ value: 9, suppressed: false });
  });

  it("lists a condition with no standard name once, as Not standardised, across hospitals", async () => {
    const { m } = setup();
    for (const v of ["prevalence", "quality"] as const) {
      const { data } = await view(m, v, all());
      const unnamed = data.by_condition.filter(
        (c) => c.condition.name === null,
      );
      expect(unnamed).toHaveLength(1);
      expect(unnamed[0]!.condition).toEqual({
        id: "unmapped",
        name: null,
        icd10: null,
      });
    }
  });

  it("hides the rare pair and lists it after the shown pairs", async () => {
    const { m } = setup();
    for (const q of [all(), one("h_havana")]) {
      const { data } = await view(m, "co-occurring", q);
      expect(data.pairs.length).toBeLessThanOrEqual(20);
      const rare = data.pairs.findIndex(
        (p) =>
          [p.a.id, p.b.id].sort().join() === "a15,n18" ||
          [p.a.id, p.b.id].sort().join() === "a15,n18",
      );
      expect(rare, JSON.stringify(q)).toBeGreaterThanOrEqual(0);
      const pair = data.pairs[rare]!;
      expect(pair.patients).toMatchObject({
        value: null,
        suppressed: true,
        drill: null,
      });
      expect(pair.share_of_a.suppressed).toBe(true);
      const firstHidden = data.pairs.findIndex((p) => p.patients.suppressed);
      for (const p of data.pairs.slice(firstHidden))
        expect(p.patients.suppressed).toBe(true);
      expect(firstHidden).toBeLessThanOrEqual(rare);
      expect(firstHidden).toBeGreaterThan(0);
    }
  });
});

// --- the grid: nothing small can be read, or worked out by subtraction ---

const SEXES = ["female", "male", "other", "not_recorded"] as const;
const SETTINGS = ["admitted", "outpatient", "emergency"] as const;
const ALL_BANDS = ["0-19", "20-39", "40-59", "60-79", "80+"] as const;
const HOSPITAL_BANDS = ["0-17", "18-39", "40-64", "65-79", "80+"] as const;
const PERIOD_IDS: readonly AnalysisPeriod[] = ["3m", "6m", "12m"];
const ZERO: AGuarded = { value: 0, suppressed: false };

/**
 * Every filter the page can set across hospitals: each value alone, and the
 * pairs and triples someone would try. Each runs in every period.
 */
const ACROSS: Partial<AnalysisQuery>[] = [
  {},
  ...ALL_CONDITIONS.map((c) => ({ condition: c.id })),
  ...ALL_BANDS.map((age_band) => ({ age_band })),
  ...SEXES.map((sex) => ({ sex })),
  ...SETTINGS.map((setting) => ({ setting })),
  ...SPECIALTIES.map((specialty) => ({ specialty })),
  ...SEXES.flatMap((sex) => SETTINGS.map((setting) => ({ sex, setting }))),
  ...ALL_CONDITIONS.flatMap((c) =>
    SEXES.map((sex) => ({ condition: c.id, sex })),
  ),
  ...SETTINGS.flatMap((setting) =>
    ["General medicine", "Cardiology", "Paediatrics"].map((specialty) => ({
      setting,
      specialty,
    })),
  ),
  ...ALL_BANDS.map((age_band) => ({ age_band, sex: "female" as const })),
  { condition: "e11", sex: "female", setting: "outpatient" },
  { condition: "j18", age_band: "80+", sex: "male" },
  { age_band: "80+", setting: "admitted", specialty: "General medicine" },
];
/** One-hospital filters with no all-hospitals twin. */
function hospitalOnly(id: string): Partial<AnalysisQuery>[] {
  const p = PROFILES.find((x) => x.id === id)!;
  return [
    ...HOSPITAL_BANDS.filter((b) => b !== "80+").map((age_band) => ({
      age_band,
    })),
    ...LOCATIONS.map((l) => ({ location: l.id })),
    ...(p.sources.length > 1 ? p.sources.map((s) => ({ source: s.id })) : []),
    { condition: "unmapped" },
    { condition: "unmapped", sex: "female" },
    { location: "ward4", sex: "female", age_band: "40-64", condition: "i10" },
  ];
}
/** The one-hospital query that asks the same as an all-hospitals one. */
function twinOf(f: Partial<AnalysisQuery>): Partial<AnalysisQuery> | null {
  if (f.age_band && f.age_band !== "80+") return null;
  if (!f.condition) return f;
  const c = CONDITIONS.find(
    (x) => x.icd10 !== null && allId(x.id) === f.condition,
  );
  return c ? { ...f, condition: c.id } : null;
}

/** What each view's headline counts, over what. */
const HEAD_FIDS: Record<ViewId, readonly [string, string]> = {
  prevalence: ["head", "seen"],
  affected: ["head", "seen"],
  "co-occurring": ["head", "seen"],
  findings: ["fhead", "seen"],
  quality: ["qagreed", "qrated"],
};
/** The figures an all-hospitals row shows for its hospital. */
const ROW_FIDS = new Set(["seen", "head", "fhead", "qagreed", "qrated"]);

/** Every count one owner (all hospitals, or one) publishes, by what it counts. */
type Owner = {
  figs: Map<string, AGuarded>;
  /** Lists cut at 20 rows: a missing row there is not a 0. */
  cut: Set<string>;
  /** Whether its own One hospital views were read, not only its rows. */
  views: boolean;
  bands: readonly string[];
  hospital: boolean;
  condition: string | null;
};
const owner = (
  views: boolean,
  hospital: boolean,
  condition: string | null,
): Owner => ({
  figs: new Map(),
  cut: new Set(),
  views,
  bands: hospital ? HOSPITAL_BANDS : ALL_BANDS,
  hospital,
  condition: condition === null ? null : allId(condition),
});
const show = (g: AGuarded) =>
  g.suppressed ? `hidden${g.why ? ` (${g.why})` : ""}` : String(g.value);
const label = (q: AnalysisQuery) =>
  `${q.hospital ?? "all"} ${q.period} ${JSON.stringify(
    Object.fromEntries(
      Object.entries(q).filter(
        ([k, v]) => v !== null && !["scope", "hospital", "period"].includes(k),
      ),
    ),
  )}`;

/** Reads all five views of a query into `o` (and the rows into `rows`). */
async function readAll(
  m: Mock,
  q: AnalysisQuery,
  o: Owner,
  problems: string[],
  rows?: Map<string, Owner>,
) {
  for (const v of VIEW_IDS) {
    const out = await view(m, v, q);
    const where = `${v} ${label(q)}`;
    const put = (to: Owner, fid: string, g: AGuarded, at = where) => {
      const had = to.figs.get(fid);
      const g2: AGuarded = { value: g.value, suppressed: g.suppressed };
      if (g.why !== undefined) g2.why = g.why;
      if (had === undefined) to.figs.set(fid, g2);
      else if (
        had.value !== g2.value ||
        had.suppressed !== g2.suppressed ||
        had.why !== g2.why
      )
        problems.push(
          `[same cell] ${at} ${fid}: ${show(had)} here, ${show(g2)} there`,
        );
    };
    for (const [key, g] of guarded(out)) {
      if (g.suppressed && g.value !== null)
        problems.push(`[small] ${where} ${key}: hidden but carries a value`);
      if (
        !g.suppressed &&
        COUNTS.has(key) &&
        g.value !== null &&
        g.value >= 1 &&
        g.value <= 4
      )
        problems.push(`[small] ${where} ${key} shows ${g.value}`);
      if (g.why !== undefined && (!g.suppressed || q.scope !== "all"))
        problems.push(`[small] ${where} ${key}: why ${g.why}`);
    }
    const [hc, hb] = HEAD_FIDS[v];
    put(o, "group", out.patients);
    put(o, hc, out.headline.count);
    put(o, hb, out.headline.base);
    if (out.comparison) put(o, "seen", out.comparison.context.size);
    if (rows && out.hospitals)
      for (const r of out.hospitals) {
        const h = rows.get(r.hospital.id)!;
        const at = `${where} row ${r.hospital.id}`;
        put(h, "seen", r.size, at);
        put(h, hc, r.headline.count, at);
        put(h, hb, r.headline.base, at);
      }
    const cid = (id: string) => allId(id);
    if (v === "prevalence") {
      const d = out.data as PrevalenceData;
      for (const r of d.by_condition) {
        const c = cid(r.condition.id);
        put(o, `c:${c}`, r.cases);
        put(o, `c:${c}`, r.rate.count);
        put(o, `n:${c}`, r.new);
        put(o, "seen", r.rate.base);
      }
      for (const s of d.series) {
        put(o, `mh:${s.month}`, s.rate.count);
        put(o, `ms:${s.month}`, s.rate.base);
      }
    } else if (v === "affected") {
      const d = out.data as AffectedData;
      for (const r of d.by_age) put(o, `age:${r.band}`, r.patients);
      for (const r of d.by_sex) put(o, `sex:${r.sex}`, r.patients);
      for (const r of d.by_setting)
        put(o, `set:${r.setting ?? "-"}`, r.patients);
      for (const r of d.by_specialty)
        put(o, `spec:${r.specialty ?? "-"}`, r.patients);
      for (const r of d.by_location ?? [])
        put(o, `loc:${r.location?.id ?? "-"}`, r.patients);
    } else if (v === "co-occurring") {
      const d = out.data as CoOccurringData;
      for (const p of d.pairs)
        put(o, `p:${cid(p.a.id)}|${cid(p.b.id)}`, p.patients);
      if (d.pairs.length >= 20) o.cut.add("p:");
    } else if (v === "findings") {
      const d = out.data as FindingsData;
      for (const x of d.findings) {
        const k = `f:${x.name ?? "-"}|${x.flag ?? "-"}`;
        put(o, k, x.patients);
        put(o, k, x.rate.count);
        put(o, "seen", x.rate.base);
      }
      if (d.findings.length >= 20) o.cut.add("f:");
      put(o, "al:total", d.alerts.total);
      for (const s of ["critical", "urgent", "info"] as const)
        put(o, `al:${s}`, d.alerts.by_severity[s]);
    } else {
      const d = out.data as QualityData;
      for (const r of d.by_condition) {
        const p = `q:${cid(r.condition.id)}:`;
        put(o, `${p}cons`, r.consultations);
        for (const c of ["high", "medium", "low"] as const)
          put(o, `${p}${c}`, r.confidence[c]);
        put(o, `${p}rated`, r.rated);
        put(o, `${p}rev`, r.reviewers);
        put(o, `${p}corr`, r.corrections.total);
        for (const c of ["approved", "rejected", "waiting"] as const)
          put(o, `${p}${c}`, r.corrections[c]);
      }
    }
  }
}

/**
 * A total and the parts that add up to it. Fails when the hidden parts can
 * be worked out: exactly one hidden part, or hidden parts adding up to 1 to
 * 4, or a hidden total whose parts all show.
 */
function sums(
  total: AGuarded | undefined,
  parts: (AGuarded | "unknown")[],
  where: string,
  problems: string[],
) {
  if (total === undefined) return;
  const hidden = parts.filter((p) => p === "unknown" || p.suppressed).length;
  const shown = parts.reduce(
    (s, p) => (p === "unknown" || p.suppressed ? s : s + (p.value ?? 0)),
    0,
  );
  if (total.suppressed) {
    if (hidden === 0 && total.why === undefined)
      problems.push(`${where}: hidden, but the parts show it is ${shown}`);
    return;
  }
  const rest = (total.value ?? 0) - shown;
  if (hidden === 0) {
    if (rest !== 0) problems.push(`${where}: the parts add up to ${shown}`);
  } else if (hidden === 1)
    problems.push(`${where}: one hidden part, worked out as ${rest}`);
  else if (rest >= 1 && rest <= 4)
    problems.push(`${where}: the hidden parts add up to ${rest}`);
}

/** The sets inside one owner's replies that add up. */
function withinOwner(o: Owner, where: string, problems: string[]) {
  const eqs: [string, string[]][] = [
    ["group", o.bands.map((b) => `age:${b}`)],
    ["group", SEXES.map((s) => `sex:${s}`)],
    ["group", [...SETTINGS, "-"].map((s) => `set:${s}`)],
    ["group", [...SPECIALTIES, "-"].map((s) => `spec:${s}`)],
    ["al:total", ["critical", "urgent", "info"].map((s) => `al:${s}`)],
  ];
  if (o.hospital)
    eqs.push([
      "group",
      [...LOCATIONS.map((l) => l.id), "-"].map((l) => `loc:${l}`),
    ]);
  const qids = [...o.figs.keys()].flatMap((k) => {
    const x = /^q:(.+):cons$/.exec(k);
    return x ? [x[1]!] : [];
  });
  for (const id of qids)
    eqs.push(
      [`q:${id}:cons`, ["high", "medium", "low"].map((c) => `q:${id}:${c}`)],
      [
        `q:${id}:corr`,
        ["approved", "rejected", "waiting"].map((c) => `q:${id}:${c}`),
      ],
    );
  eqs.push(["qrated", qids.map((id) => `q:${id}:rated`)]);
  if (o.condition === null) eqs.push(["seen", ["group"]]);
  else eqs.push(["group", ["head"]], ["group", [`c:${o.condition}`]]);
  for (const [t, parts] of eqs)
    sums(
      o.figs.get(t),
      parts.map((k) => o.figs.get(k) ?? ZERO),
      `[sub-total] ${where} ${t} = ${parts.join(" + ")}`,
      problems,
    );
}

/** All hospitals' figure against the hospitals' own, for each figure. */
function acrossOwners(
  total: Owner,
  parts: Owner[],
  where: string,
  problems: string[],
) {
  const comparable = (fid: string, p: Owner) =>
    p.views
      ? !(fid.startsWith("age:") && fid !== "age:80+")
      : ROW_FIDS.has(fid);
  for (const [fid, t] of total.figs) {
    if (parts.some((p) => !comparable(fid, p))) continue;
    sums(
      t,
      parts.map(
        (p) =>
          p.figs.get(fid) ?? (p.cut.has(fid.slice(0, 2)) ? "unknown" : ZERO),
      ),
      `[across] ${where} ${fid}`,
      problems,
    );
  }
}

async function gridFor(period: AnalysisPeriod) {
  const { m } = setup();
  const problems: string[] = [];
  for (const f of ACROSS) {
    const q = all({ ...f, period });
    const twin = twinOf(f);
    const total = owner(true, false, q.condition);
    const rows = new Map(
      PROFILES.map((p) => [
        p.id,
        owner(twin !== null, true, twin?.condition ?? null),
      ]),
    );
    await readAll(m, q, total, problems, rows);
    withinOwner(total, label(q), problems);
    if (twin)
      for (const p of PROFILES) {
        const own = one(p.id, { ...twin, period });
        await readAll(m, own, rows.get(p.id)!, problems);
        withinOwner(rows.get(p.id)!, label(own), problems);
      }
    acrossOwners(total, [...rows.values()], label(q), problems);
  }
  for (const p of PROFILES)
    for (const f of hospitalOnly(p.id)) {
      const q = one(p.id, { ...f, period });
      const o = owner(true, true, q.condition);
      await readAll(m, q, o, problems);
      withinOwner(o, label(q), problems);
    }
  return problems;
}

describe("the grid: nothing small is shown, or can be worked out", () => {
  it.each(PERIOD_IDS)(
    "every view and filter, both scopes, %s",
    async (period) => {
      const problems = await gridFor(period);
      const kinds = ["[small]", "[same cell]", "[sub-total]", "[across]"].map(
        (k) => `${k} ${problems.filter((p) => p.startsWith(k)).length}`,
      );
      expect(
        problems.slice(0, 40),
        `${problems.length} problems: ${kinds.join(", ")}`,
      ).toEqual([]);
    },
    600_000,
  );
});

describe("one hospital and all hospitals", () => {
  it("gives one row per included hospital with its size, kind and coverage", async () => {
    const out = await view(setup().m, "prevalence", all());
    expect(out.scope).toBe("all");
    expect(out.hospital).toBeNull();
    expect(out.comparison).toBeNull();
    const lake = rowOf(out, "h_lakeside");
    expect(lake).toMatchObject({
      kind: "general",
      coverage: "consultations",
      hospital: { name: "Lakeside Community Clinic" },
    });
    expect(rowOf(out, "h_riverside").kind).toBe("specialist");
    expect(rowOf(out, "h_havana").size).toEqual({
      value: 1400,
      suppressed: false,
    });
  });

  it("marks Southpoint Partly standardised, with a share near 14%", async () => {
    const out = await view(setup().m, "prevalence", all());
    const sp = rowOf(out, "h_southpoint");
    expect(sp.partly_standardised).toBe(true);
    expect(sp.not_standardised_share.value).toBeGreaterThan(0.1);
    expect(sp.not_standardised_share.value).toBeLessThan(0.2);
    for (const r of out.hospitals!)
      if (r.hospital.id !== "h_southpoint") {
        expect(r.partly_standardised, r.hospital.id).toBe(false);
        expect(r.not_standardised_share.value ?? 0).toBeLessThan(0.1);
      }
  });

  it("covers whole calendar months ending with the last complete month", async () => {
    const { m, advance } = setup();
    const a = await view(m, "prevalence", all());
    expect(a.period).toEqual({ from: "2025-10-01", to: "2026-09-30" });
    expect((await view(m, "prevalence", all({ period: "3m" }))).period).toEqual(
      {
        from: "2026-07-01",
        to: "2026-09-30",
      },
    );
    expect((await view(m, "prevalence", all({ period: "6m" }))).period).toEqual(
      {
        from: "2026-04-01",
        to: "2026-09-30",
      },
    );
    expect(a.data.series.map((s) => s.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(a.updated_at).toBe(new Date(START).toISOString());
    advance(10 * 24 * HOUR); // November
    expect((await view(m, "prevalence", all())).period.to).toBe("2026-10-31");
  });

  it("gives the rate per 1,000 patients seen with its count and base", async () => {
    const out = await view(
      setup().m,
      "prevalence",
      one("h_havana", { condition: "e11" }),
    );
    const { count, base, per_1000 } = out.headline;
    expect(base.value).toBe(1400);
    expect(per_1000.value).toBeCloseTo((count.value! / base.value!) * 1000, 0);
    expect(out.data.by_condition).toHaveLength(1);
    expect(out.data.by_condition[0]!.condition.id).toBe("e11");
  });
});

describe("fair comparison", () => {
  const cmp = async (m: Mock, h: string, v: ViewId = "prevalence", f = {}) =>
    (await view(m, v, one(h, f))).comparison;

  it("Havana compares with exactly 5 similar hospitals, never named", async () => {
    const { m } = setup();
    for (const v of ["prevalence", "findings", "quality"] as const) {
      const c = (await cmp(m, "h_havana", v))!;
      expect(c, v).toMatchObject({
        available: true,
        reason: null,
        peers: 5,
        context: {
          kind: "general",
          coverage: "consultations_and_records",
          size: { value: 1400, suppressed: false },
        },
      });
      expect(c.median.suppressed).toBe(false);
      expect(c.median.value).not.toBeNull();
      expect(["higher", "lower", "about_same"]).toContain(c.verdict);
      expect(c.current.value).not.toBeNull();
      // The 12-month view has nothing before it; 6 months has.
      expect(c.previous).toEqual({ value: null, suppressed: false });
      const json = JSON.stringify(c);
      for (const name of [
        "Northgate",
        "Harbour",
        "Westfield",
        "Ridgeway",
        "Marlow",
      ])
        expect(json).not.toContain(name);
    }
    const six = (await cmp(m, "h_havana", "prevalence", { period: "6m" }))!;
    expect(six.previous.value).not.toBeNull();
    expect(six.previous.suppressed).toBe(false);
  });

  it("uses a ±10% band of the median for the verdict", async () => {
    const { m } = setup();
    const seen = new Set<string>();
    for (const h of [
      "h_havana",
      "h_northgate",
      "h_harbour",
      "h_westfield",
      "h_ridgeway",
      "h_marlow",
    ])
      for (const f of [
        {},
        { condition: "b54" },
        { condition: "e11" },
        { condition: "j45" },
        { condition: "i10" },
      ]) {
        const c = (await cmp(m, h, "prevalence", f))!;
        if (!c.available) continue;
        const cur = c.current.value!;
        const med = c.median.value!;
        const expected =
          med === 0
            ? cur === 0
              ? "about_same"
              : "higher"
            : cur > med * 1.1
              ? "higher"
              : cur < med * 0.9
                ? "lower"
                : "about_same";
        expect(c.verdict, `${h} ${JSON.stringify(f)}`).toBe(expected);
        seen.add(c.verdict!);
      }
    // The sample shows every kind of verdict.
    expect([...seen].sort()).toEqual(["about_same", "higher", "lower"]);
  });

  it("few_peers drops Ridgeway, so Havana has 4: too_few_peers", async () => {
    const { m } = setup({ analysis: "few_peers" });
    const c = (await cmp(m, "h_havana"))!;
    expect(c).toMatchObject({
      available: false,
      reason: "too_few_peers",
      peers: 4,
      verdict: null,
    });
    expect(c.median).toEqual({ value: null, suppressed: true });
  });

  it("says why when it can't compare", async () => {
    const { m } = setup();
    expect(await cmp(m, "h_southpoint")).toMatchObject({
      available: false,
      reason: "partly_standardised",
      peers: null,
    });
    expect(await cmp(m, "h_fairhaven")).toMatchObject({
      available: false,
      reason: "too_little_history",
    });
    expect(await cmp(m, "h_riverside")).toMatchObject({
      available: false,
      reason: "too_few_peers",
      context: { kind: "specialist" },
    });
    expect(await cmp(m, "h_lakeside")).toMatchObject({
      available: false,
      reason: "too_few_peers",
      context: { coverage: "consultations" },
    });
    // Its own group is too small: small_group.
    expect(
      await cmp(m, "h_lakeside", "prevalence", { condition: "d57" }),
    ).toMatchObject({
      available: false,
      reason: "small_group",
    });
  });

  it("is not there when a peer hides the measure", async () => {
    const { m } = setup();
    // Sickle cell: Harbour View is hidden for everyone, so Havana has 4 peers.
    expect(
      await cmp(m, "h_havana", "prevalence", { condition: "d57" }),
    ).toMatchObject({
      available: false,
      reason: "too_few_peers",
      peers: 4,
    });
  });

  it("is only on Prevalence, Findings and Quality, and only for one hospital", async () => {
    const { m } = setup();
    for (const v of ["affected", "co-occurring"] as const) {
      expect((await view(m, v, one("h_havana"))).comparison).toBeNull();
      expect((await view(m, v, all())).comparison).toBeNull();
    }
    for (const v of ["prevalence", "findings", "quality"] as const) {
      expect((await view(m, v, all())).comparison).toBeNull();
      expect((await view(m, v, one("h_havana"))).hospitals).toBeNull();
    }
  });

  it("the series carries the median for one hospital when it can compare", async () => {
    const { m } = setup();
    const own = await view(m, "prevalence", one("h_havana"));
    expect(own.data.series).toHaveLength(12);
    for (const s of own.data.series) expect(s.median).not.toBeNull();
    const none = await view(m, "prevalence", one("h_riverside"));
    for (const s of none.data.series) expect(s.median).toBeNull();
    const across = await view(m, "prevalence", all());
    for (const s of across.data.series) expect(s.median).toBeNull();
  });
});

describe("the views", () => {
  it("who is affected: age in 20-year bands across hospitals, Plan 6 bands for one", async () => {
    const { m } = setup();
    const a = await view(m, "affected", all());
    expect(a.data.by_age.map((r) => r.band)).toEqual([
      "0-19",
      "20-39",
      "40-59",
      "60-79",
      "80+",
    ]);
    expect(a.data.by_location).toBeNull();
    const h = await view(m, "affected", one("h_havana"));
    expect(h.data.by_age.map((r) => r.band)).toEqual([
      "0-17",
      "18-39",
      "40-64",
      "65-79",
      "80+",
    ]);
    expect(h.data.by_location!.length).toBeGreaterThan(2);
    expect(h.data.by_sex.map((r) => r.sex)).toEqual([
      "female",
      "male",
      "other",
      "not_recorded",
    ]);
  });

  it("findings and alerts: the severities add up to the total", async () => {
    const { data } = await view(setup().m, "findings", one("h_havana"));
    const sev = data.alerts.by_severity;
    expect(sev.critical.value! + sev.urgent.value! + sev.info.value!).toBe(
      data.alerts.total.value,
    );
    expect(data.findings.length).toBeGreaterThan(3);
    expect(data.findings.length).toBeLessThanOrEqual(20);
  });

  it("quality: the confidence mix adds up, and reviewers follow the small-group rule", async () => {
    const { m } = setup();
    const { data } = await view(m, "quality", one("h_havana"));
    expect(data.by_condition.length).toBeGreaterThan(3);
    for (const row of data.by_condition) {
      const c = row.confidence;
      if (!c.high.suppressed && !c.medium.suppressed && !c.low.suppressed)
        expect(c.high.value! + c.medium.value! + c.low.value!).toBe(
          row.consultations.value,
        );
      const k = row.corrections;
      if (
        !k.approved.suppressed &&
        !k.rejected.suppressed &&
        !k.waiting.suppressed
      )
        expect(k.approved.value! + k.rejected.value! + k.waiting.value!).toBe(
          k.total.value,
        );
    }
    // Lakeside has 4 reviewers: always "Fewer than 5".
    const lake = await view(m, "quality", one("h_lakeside"));
    for (const row of lake.data.by_condition)
      if (row.rated.value) expect(row.reviewers.suppressed).toBe(true);
    // No reviewer id or name in any reply.
    expect(JSON.stringify(lake)).not.toMatch(/reviewer"?:\s*"/);
  });

  it("quality: the headline is the agreement rate, agreed over rated", async () => {
    const { m } = setup();
    let rated = 0;
    let agreed = 0;
    for (const p of cohortOf("h_havana"))
      for (const c of p.consultations)
        if (c.agreed !== null) {
          rated++;
          if (c.agreed) agreed++;
        }
    const own = await view(m, "quality", one("h_havana"));
    expect(own.headline.count).toEqual({ value: agreed, suppressed: false });
    expect(own.headline.base).toEqual({ value: rated, suppressed: false });
    const rate = Math.round((agreed / rated) * 1000 * 10) / 10;
    expect(own.headline.per_1000).toEqual({ value: rate, suppressed: false });
    // The comparison compares the same rate.
    expect(own.comparison!.current).toEqual(own.headline.per_1000);
    expect(own.comparison!.available).toBe(true);
    // The base is the rated count, the sum of the conditions' rated.
    const sum = own.data.by_condition.reduce(
      (s, r) => s + (r.rated.value ?? 0),
      0,
    );
    expect(sum).toBe(rated);
    const across = await view(m, "quality", all());
    expect(rowOf(across, "h_havana").headline).toEqual(own.headline);
  });
});

describe("what the mock refuses", () => {
  it("a 4th filter across hospitals is 422 too_many_filters; a 5th for one hospital too", async () => {
    const { m } = setup();
    const three = {
      condition: "e11",
      sex: "female",
      setting: "admitted",
    } as const;
    await view(m, "prevalence", all(three));
    expect(
      await failure(
        m.getAnalysisView(
          "prevalence",
          all({ ...three, specialty: "Cardiology" }),
        ),
      ),
    ).toEqual([422, "too_many_filters"]);
    const four = {
      condition: "e11",
      sex: "female",
      setting: "admitted",
      age_band: "40-64",
    } as const;
    await view(m, "prevalence", one("h_havana", four));
    expect(
      await failure(
        m.getAnalysisView(
          "prevalence",
          one("h_havana", { ...four, specialty: "Cardiology" }),
        ),
      ),
    ).toEqual([422, "too_many_filters"]);
    expect(
      await failure(
        m.recordDownload(
          {
            view: "prevalence",
            query: all({ ...three, specialty: "Cardiology" }),
          },
          KEY(),
        ),
      ),
    ).toEqual([422, "too_many_filters"]);
  });

  it("is 422 invalid for what the scope doesn't allow", async () => {
    const { m } = setup();
    const bad: AnalysisQuery[] = [
      all({ location: "ward4" }),
      all({ source: "main_record" }),
      all({ condition: "j18_9" }),
      all({ condition: "unmapped" }),
      all({ condition: "zzz" }),
      all({ age_band: "0-17" }),
      all({ hospital: "h_havana" }),
      all({ period: "1m" as never }),
      one("h_havana", { age_band: "0-19" }),
      one("h_havana", { condition: "j18" }),
      one("h_havana", { location: "nowhere" }),
      one("h_havana", { source: "nowhere" }),
      one("h_westfield", { source: "main_record" }),
      one("h_havana", { sex: "robot" as never }),
      one("h_havana", { specialty: "Astrology" }),
      one("h_hilltop"),
      one("h_eastbrook"),
      { ...ALL, scope: "hospital", hospital: null },
      { ...ALL, scope: "nowhere" as never },
    ];
    for (const q of bad)
      expect(
        await failure(m.getAnalysisView("prevalence", q)),
        JSON.stringify(q),
      ).toEqual([422, "invalid"]);
    expect(await failure(m.getAnalysisView("nope" as never, all()))).toEqual([
      422,
      "invalid",
    ]);
    // A hospital that doesn't exist is not found.
    expect(
      await failure(m.getAnalysisView("prevalence", one("h_nowhere"))),
    ).toEqual([404, "not_found"]);
    // The limits are checked after the shape: an invalid query is invalid first.
    expect(
      await failure(
        m.getAnalysisView(
          "prevalence",
          all({
            location: "ward4",
            condition: "e11",
            sex: "male",
            setting: "admitted",
          }),
        ),
      ),
    ).toEqual([422, "invalid"]);
    // And the allowed ones work.
    await view(
      m,
      "prevalence",
      one("h_havana", { source: "results_system", location: "ward4" }),
    );
    await view(
      m,
      "prevalence",
      one("h_havana", { condition: "j18_9", age_band: "65-79" }),
    );
    await view(m, "prevalence", all({ condition: "j18", age_band: "60-79" }));
  });

  it("an auditor is 403 on every analysis path but the trail", async () => {
    const { m } = setup({ email: TEAM_EMAILS.amara });
    const forbidden = [403, "forbidden"];
    expect(await failure(m.getAnalysisStatus())).toEqual(forbidden);
    expect(await failure(m.getAnalysisFilters("all", null))).toEqual(forbidden);
    for (const v of VIEW_IDS)
      expect(await failure(m.getAnalysisView(v, all()))).toEqual(forbidden);
    expect(
      await failure(
        m.recordDownload({ view: "prevalence", query: all() }, KEY()),
      ),
    ).toEqual(forbidden);
    const trail = await m.listAnalysisAccess({});
    expect(trail.entries.length).toBeGreaterThan(0);
    const file = await m.exportAnalysisAccess({});
    expect(file.filename).toMatch(/^mhai-analysis-access-/);
  });

  it("nobody signed in is 401, decided before the delay", async () => {
    const { m, as } = setup({ email: null });
    expect(await failure(m.getAnalysisStatus())).toEqual([
      401,
      "session_expired",
    ]);
    as(TEAM_EMAILS.ada);
    const pending = m.getAnalysisView("prevalence", all());
    as(null);
    expect((await pending).hasOwnProperty("view")).toBe(true);
  });

  it("unavailable returns {unavailable: true} for every view", async () => {
    const { m } = setup({ analysis: "unavailable" });
    for (const v of VIEW_IDS)
      expect(await m.getAnalysisView(v, all())).toEqual({ unavailable: true });
    expect((await m.getAnalysisStatus()).aggregates_enabled).toBe(true);
  });

  it("failView fails that view alone", async () => {
    const { m } = setup({ analysis: { failView: "findings" } });
    expect(await failure(m.getAnalysisView("findings", all()))).toEqual([
      503,
      "unavailable",
    ]);
    await view(m, "prevalence", all());
    await view(m, "quality", one("h_havana"));
  });
});

describe("the access trail", () => {
  it("starts with one of each kind, a flagged patient list among them", async () => {
    const { entries, next_cursor } = await setup().m.listAnalysisAccess({});
    expect(next_cursor).toBeNull();
    expect(entries.map((e) => e.kind).sort()).toEqual([
      "download",
      "patient_list",
      "visit",
    ]);
    const actors = new Set(entries.map((e) => e.actor.name));
    expect(actors).toEqual(new Set(["Ada Bakare", "Tunde Okafor"]));
    const list = entries.find((e) => e.kind === "patient_list")!;
    expect(list).toMatchObject({ flagged: true, clearance_id: "cl_act" });
    expect(list.count).toBeGreaterThan(0);
    for (const e of entries.filter((x) => x.kind !== "patient_list"))
      expect(e.flagged).toBe(false);
    // Newest first.
    const times = entries.map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("each view call adds a visit; recordDownload adds a download", async () => {
    const { m, advance } = setup();
    advance(HOUR);
    await view(
      m,
      "quality",
      one("h_northgate", { sex: "female", condition: "e11" }),
    );
    let { entries } = await m.listAnalysisAccess({});
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      kind: "visit",
      actor: { id: "tm_ada", name: "Ada Bakare" },
      scope: "hospital",
      hospital: { id: "h_northgate", name: "Northgate General Hospital" },
      view: "quality",
      period: "12m",
      filters: [
        { key: "condition", label: "Type 2 diabetes" },
        { key: "sex", label: "Female" },
      ],
      count: null,
      clearance_id: null,
      flagged: false,
    });
    expect(entries[0]!.at).toBe(new Date(START + HOUR).toISOString());
    await view(m, "affected", all());
    ({ entries } = await m.listAnalysisAccess({}));
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({
      scope: "all",
      hospital: null,
      filters: [],
    });

    advance(HOUR);
    const k = KEY();
    await m.recordDownload(
      { view: "findings", query: all({ period: "6m" }) },
      k,
    );
    await m.recordDownload(
      { view: "findings", query: all({ period: "6m" }) },
      k,
    );
    ({ entries } = await m.listAnalysisAccess({}));
    expect(entries).toHaveLength(6);
    expect(entries[0]).toMatchObject({
      kind: "download",
      view: "findings",
      period: "6m",
      flagged: false,
    });
    // Failed calls leave nothing behind.
    await failure(m.getAnalysisView("prevalence", all({ location: "x" })));
    expect((await m.listAnalysisAccess({})).entries).toHaveLength(6);
  });

  it("filters by hospital and kind, and pages", async () => {
    const { m } = setup();
    for (let i = 0; i < 55; i++) await view(m, "prevalence", one("h_marlow"));
    const marlow = await m.listAnalysisAccess({ hospital: "h_marlow" });
    expect(marlow.entries).toHaveLength(50);
    expect(marlow.next_cursor).not.toBeNull();
    const rest = await m.listAnalysisAccess({
      hospital: "h_marlow",
      cursor: marlow.next_cursor!,
    });
    expect(rest.entries).toHaveLength(5);
    expect(rest.next_cursor).toBeNull();
    expect(
      (await m.listAnalysisAccess({ kind: "download" })).entries.map(
        (e) => e.kind,
      ),
    ).toEqual(["download"]);
    expect(
      (await m.listAnalysisAccess({ hospital: "h_havana", kind: "visit" }))
        .entries,
    ).toEqual([]);
  });

  it("exports the trail as a CSV with who did what, and no figures", async () => {
    const { m } = setup();
    await view(m, "prevalence", one("h_havana", { condition: "e11" }));
    const { filename, blob } = await m.exportAnalysisAccess({});
    expect(filename).toBe("mhai-analysis-access-2026-10-23.csv");
    expect(blob.type).toContain("text/csv");
    const text = await blob.text();
    expect(text).toContain("Ada Bakare");
    expect(text).toContain("Tunde Okafor");
    expect(text).toContain("Havana Hospital");
    expect(text).toContain("cl_act");
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(5);
    const only = await m.exportAnalysisAccess({ kind: "download" });
    expect((await only.blob.text()).split("\r\n").filter(Boolean)).toHaveLength(
      2,
    );
  });

  it("is seeded in Activity: Ada Bakare turned Analysis on", async () => {
    const { events } = await setup().m.listActivity({});
    const e = events.find((x) => x.action === "analysis_switched")!;
    expect(e).toMatchObject({
      actor: { name: "Ada Bakare" },
      detail: "on",
      hospital: null,
    });
  });
});

describe("what a reply can carry", () => {
  it("has no patient field anywhere, in any reply", async () => {
    const { m } = setup();
    const replies: unknown[] = [
      await m.getAnalysisStatus(),
      await m.getAnalysisFilters("all", null),
      await m.getAnalysisFilters("hospital", "h_havana"),
      await m.listAnalysisAccess({}),
    ];
    for (const v of VIEW_IDS)
      for (const q of [
        all(),
        one("h_havana"),
        one("h_lakeside", { condition: "d57" }),
      ])
        replies.push(await m.getAnalysisView(v, q));
    const keys = new Set<string>();
    (function walk(x: unknown) {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object")
        for (const [k, v] of Object.entries(x)) {
          keys.add(k.toLowerCase());
          walk(v);
        }
    })(replies);
    for (const banned of [
      "pid",
      "mrn",
      "dob",
      "date_of_birth",
      "address",
      "patient_name",
      "age",
    ])
      expect(keys.has(banned), banned).toBe(false);
    const text = JSON.stringify(replies);
    expect(text).not.toMatch(/\bP-[A-Z0-9]{5}\b/);
    expect(text).not.toMatch(/HH-\d{6}/);
  });

  it("names no vendor, and uses no lab wording", async () => {
    const { m } = setup();
    const text = JSON.stringify([
      await m.getAnalysisStatus(),
      await m.getAnalysisFilters("hospital", "h_havana"),
      await view(m, "findings", one("h_havana")),
      await m.listAnalysisAccess({}),
    ]).toLowerCase();
    for (const v of VENDOR_NAMES) expect(text).not.toContain(v);
    expect(text).not.toMatch(/\blab\b/);
  });

  it("every id is opaque", async () => {
    const { m } = setup();
    const out = await view(m, "prevalence", all());
    for (const r of out.hospitals!)
      expect(r.hospital.id).toMatch(/^[A-Za-z0-9_-]+$/);
    const { entries } = await m.listAnalysisAccess({});
    for (const e of entries) expect(e.id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
