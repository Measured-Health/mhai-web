import { describe, expect, it } from "vitest";
import {
  PART_PAIR_COUNT,
  VIEW_IDS,
  type AGuarded,
  type PartPair,
  type AnalysisPeriod,
  type AnalysisQuery,
  type ScopeKind,
  type ViewId,
} from "../api/analysis-contract";
import { LOCATIONS, PROFILES } from "../api/analysis-fixtures";
import { TEAM_EMAILS } from "../api/fixtures";
import { createMockPlatform } from "../api/mock";
import {
  figuresOf,
  familyOfFigure,
  pairInstances,
  readFilterOptions,
  readStatus,
  readView,
  viewProblem,
  type FigureItem,
} from "./read";

const NOW = Date.parse("2026-10-23T09:30:00.000Z");
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function mock() {
  return createMockPlatform({
    now: () => NOW,
    me: () => TEAM_EMAILS.ada,
    delayMs: 0,
  });
}

const EMPTY: AnalysisQuery = {
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
  ...EMPTY,
  ...over,
});
const one = (
  hospital: string,
  over: Partial<AnalysisQuery> = {},
): AnalysisQuery => ({ ...EMPTY, scope: "hospital", hospital, ...over });

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** A fresh copy each time: a test may change any part of it. */
const fresh =
  <A extends unknown[]>(make: (...a: A) => Raw) =>
  (...a: A): Raw =>
    clone(make(...a));
const read = <V extends ViewId>(view: V, raw: unknown, q: AnalysisQuery) =>
  readView(view, raw, q, NOW);
/** The reader's reason, so each test proves the rule it names failed it. */
const problem = (view: ViewId, raw: unknown, q: AnalysisQuery) =>
  viewProblem(view, raw, q, NOW);

// ---- Hand-made replies: valid, then broken one rule at a time --------------

const g = (value: number): AGuarded => ({ value, suppressed: false });
const HID: AGuarded = { value: null, suppressed: true };
const FEW: AGuarded = {
  value: null,
  suppressed: true,
  why: "too_few_hospitals",
};
const dr = (v: AGuarded) => ({ ...v, drill: null });
const per = (c: number, b: number) => Math.round((c / b) * 10_000) / 10;
const rate = (c: number, b: number) => ({
  count: g(c),
  base: g(b),
  per_1000: g(per(c, b)),
});
const share = (n: number, d: number) => g(Math.round((n / d) * 100) / 100);
const PERIOD_12M = { from: "2025-10-01", to: "2026-09-30" };
const MONTHS_12M = [
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
];
const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };
const I10 = { id: "i10", name: "Hypertension", icd10: "I10" };
const N18 = { id: "n18", name: "Chronic kidney disease", icd10: "N18" };
const HAVANA = { id: "h_havana", name: "Havana Hospital" };

const row = (id: string, name: string, size: number, count: number) => ({
  hospital: { id, name },
  size: g(size),
  kind: "general",
  coverage: "consultations_and_records",
  not_standardised_share: g(0.02),
  partly_standardised: false,
  headline: rate(count, size),
});
/** Four hospitals: 2,000 seen, 200 with a condition in scope. */
const ROWS = () => [
  row("h_a", "Alder", 800, 80),
  row("h_b", "Birch", 600, 60),
  row("h_c", "Cedar", 400, 40),
  row("h_d", "Daisy", 200, 20),
];

const meta = (view: ViewId, scope: ScopeKind) => ({
  view,
  scope,
  hospital: scope === "all" ? null : HAVANA,
  period: PERIOD_12M,
  updated_at: "2026-10-23T09:30:00.000Z",
  patients: g(2000),
  headline: rate(200, 2000),
  hospitals: scope === "all" ? ROWS() : null,
  comparison: null as Raw | null,
});
const comparison = () => ({
  available: true,
  reason: null,
  peers: 5,
  current: g(per(200, 2000)),
  previous: g(90),
  median: g(95),
  verdict: "about_same",
  context: {
    size: g(2000),
    kind: "general",
    coverage: "consultations_and_records",
  },
});

const prevalence = fresh(function prevalence(scope: ScopeKind): Raw {
  return {
    ...meta("prevalence", scope),
    comparison: scope === "hospital" ? comparison() : null,
    data: {
      by_condition: [
        {
          condition: E11,
          cases: dr(g(150)),
          rate: rate(150, 2000),
          new: g(30),
        },
        { condition: I10, cases: dr(g(50)), rate: rate(50, 2000), new: g(10) },
      ],
      series: MONTHS_12M.map((month) => ({
        month,
        rate: rate(40, 500),
        median: scope === "hospital" ? g(70) : null,
      })),
    },
  };
});

/**
 * 215 patients seen, 200 with a condition in scope; every breakdown adds up
 * to the group (with no condition filter, the group is everyone seen).
 */
const affected = fresh(function affected(scope: ScopeKind): Raw {
  const set = <K extends string>(key: K, pairs: [unknown, number][]) =>
    pairs.map(([v, n]) => ({
      [key]: v,
      patients: dr(g(n)),
      share: share(n, 215),
    }));
  const bands =
    scope === "all"
      ? ["0-19", "20-39", "40-59", "60-79", "80+"]
      : ["0-17", "18-39", "40-64", "65-79", "80+"];
  return {
    ...meta("affected", scope),
    patients: g(215),
    headline: rate(200, 215),
    hospitals:
      scope === "all"
        ? [
            row("h_a", "Alder", 100, 90),
            row("h_b", "Birch", 65, 60),
            row("h_c", "Cedar", 50, 50),
          ]
        : null,
    data: {
      by_age: set("band", [
        [bands[0], 15],
        [bands[1], 50],
        [bands[2], 100],
        [bands[3], 40],
        [bands[4], 10],
      ]),
      by_sex: set("sex", [
        ["female", 110],
        ["male", 105],
        ["other", 0],
        ["not_recorded", 0],
      ]),
      by_setting: set("setting", [
        ["admitted", 115],
        ["outpatient", 100],
      ]),
      by_specialty: set("specialty", [
        ["General medicine", 200],
        [null, 15],
      ]),
      by_location:
        scope === "all"
          ? null
          : set("location", [
              [LOCATIONS[0], 200],
              [null, 15],
            ]),
    },
  };
});

const coOccurring = fresh(function coOccurring(
  scope: ScopeKind,
  n: number = 3,
): Raw {
  const conds = [E11, I10, N18];
  const pairs = [];
  for (let i = 0; i < n; i++)
    pairs.push({
      a: conds[i % 3],
      b: { id: `c${i}`, name: `Condition ${i}`, icd10: `Z${10 + i}` },
      patients: dr(g(40 - i)),
      share_of_a: g(0.2),
    });
  return { ...meta("co-occurring", scope), data: { pairs } };
});

const findings = fresh(function findings(scope: ScopeKind): Raw {
  return {
    ...meta("findings", scope),
    comparison: scope === "hospital" ? comparison() : null,
    data: {
      findings: [
        {
          name: "Haemoglobin",
          flag: "low",
          patients: dr(g(120)),
          rate: rate(120, 2000),
        },
      ],
      alerts: {
        total: g(60),
        by_severity: { critical: g(10), urgent: g(20), info: g(30) },
      },
    },
  };
});

const quality = fresh(function quality(scope: ScopeKind): Raw {
  return {
    ...meta("quality", scope),
    headline: rate(75, 100),
    hospitals:
      scope === "all"
        ? [
            { ...row("h_a", "Alder", 800, 0), headline: rate(30, 40) },
            { ...row("h_b", "Birch", 600, 0), headline: rate(25, 35) },
            { ...row("h_c", "Cedar", 600, 0), headline: rate(20, 25) },
          ]
        : null,
    comparison:
      scope === "hospital"
        ? { ...comparison(), current: g(750), context: comparison().context }
        : null,
    data: {
      by_condition: [
        {
          condition: E11,
          consultations: g(300),
          confidence: { high: g(200), medium: g(80), low: g(20) },
          rated: g(100),
          agreement_rate: g(0.75),
          reviewers: g(6),
          corrections: {
            total: g(20),
            approved: g(10),
            rejected: g(5),
            waiting: g(5),
          },
        },
      ],
    },
  };
});

const MADE: Record<ViewId, (s: ScopeKind) => Raw> = {
  prevalence,
  affected,
  "co-occurring": (s) => coOccurring(s),
  findings,
  quality,
};
const queryFor = (s: ScopeKind) => (s === "all" ? all() : one("h_havana"));

describe("readView: the hand-made replies", () => {
  it("each view reads in both scopes", () => {
    for (const view of VIEW_IDS)
      for (const s of ["all", "hospital"] as const) {
        expect(problem(view, MADE[view](s), queryFor(s))).toBeNull();
        expect(read(view, MADE[view](s), queryFor(s)).status).toBe("ok");
      }
  });

  it("a read view carries the query it was read against (I1)", () => {
    const q = one("h_havana", { sex: "female" });
    const out = read("prevalence", prevalence("hospital"), q);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.query).toEqual(q);
    expect(out.query).not.toBe(q);
  });

  it("keeps too_few_hospitals on a hidden value", () => {
    const r = prevalence("all");
    r.data.by_condition[1].cases = dr(FEW);
    r.data.by_condition[1].rate = { count: FEW, base: g(2000), per_1000: FEW };
    r.data.by_condition[1].new = FEW;
    const out = read("prevalence", r, all());
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.data.data.by_condition[1].cases).toEqual(dr(FEW));
  });
});

describe("readView: fails closed", () => {
  it("on unavailable, a wrong shape or an extra key", () => {
    expect(read("prevalence", { unavailable: true }, all()).status).toBe(
      "failed",
    );
    expect(read("prevalence", null, all()).status).toBe("failed");
    const extra = prevalence("all");
    extra.note = "Havana had 3";
    expect(problem("prevalence", extra, all())).toMatch(/key/);
    const deep = prevalence("all");
    deep.data.by_condition[0].local_name = "Sugar";
    expect(problem("prevalence", deep, all())).toMatch(/key/);
  });

  it("on a scope, hospital or view that doesn't match the query", () => {
    expect(problem("affected", prevalence("all"), all())).toMatch(/view/);
    expect(problem("prevalence", prevalence("all"), one("h_havana"))).toMatch(
      /scope/,
    );
    expect(
      problem("prevalence", prevalence("hospital"), one("h_northgate")),
    ).toMatch(/hospital/);
  });

  it("an unsuppressed 3 fails the view", () => {
    const r = prevalence("all");
    r.data.by_condition[1].new = g(3);
    expect(problem("prevalence", r, all())).toMatch(/new/);
    expect(read("prevalence", r, all()).status).toBe("failed");
  });

  it("a hidden value sent with its number fails", () => {
    const r = prevalence("all");
    r.data.by_condition[1].new = { value: 7, suppressed: true };
    expect(problem("prevalence", r, all())).toMatch(/new/);
  });

  it("a rate shown over a hidden count fails", () => {
    const r = prevalence("all");
    r.data.by_condition[0].rate.count = HID;
    r.data.by_condition[0].cases = dr(HID);
    expect(problem("prevalence", r, all())).toMatch(/rate/);
  });

  it("a rate shown over a hidden base fails", () => {
    const r = prevalence("all");
    r.data.series[3].rate.base = HID;
    expect(problem("prevalence", r, all())).toMatch(/rate/);
  });

  it("a rate whose base − count is 2 fails", () => {
    const r = prevalence("all");
    r.data.series[0].rate = rate(498, 500);
    expect(problem("prevalence", r, all())).toMatch(/rate/);
  });

  it("a rate whose base − count is 2 fails even with its per 1,000 hidden", () => {
    // The complement is published by subtraction: 500 − 498 = 2.
    for (const s of ["all", "hospital"] as const) {
      const r = prevalence(s);
      r.data.series[0].rate = { ...rate(498, 500), per_1000: HID };
      expect(problem("prevalence", r, queryFor(s))).toMatch(/leaving 1–4/);
    }
    const q = quality("hospital");
    q.headline = { ...rate(97, 100), per_1000: HID };
    q.comparison = null;
    expect(problem("quality", q, one("h_havana"))).toMatch(/leaving 1–4/);
  });

  it("a rate that doesn't match its count and base fails", () => {
    const r = prevalence("all");
    r.data.series[0].rate.per_1000 = g(400);
    expect(problem("prevalence", r, all())).toMatch(/rate/);
  });

  it("female 212, male hidden, total 215 fails who is affected", () => {
    for (const s of ["all", "hospital"] as const) {
      const r = affected(s);
      r.data.by_sex = [
        { sex: "female", patients: dr(g(212)), share: HID },
        { sex: "male", patients: dr(HID), share: HID },
        { sex: "other", patients: dr(g(0)), share: g(0) },
        { sex: "not_recorded", patients: dr(g(0)), share: g(0) },
      ];
      expect(problem("affected", r, queryFor(s))).toMatch(/by_sex/);
    }
  });

  it("a share that leaks its numerator fails", () => {
    const r = affected("all");
    // 0.99 of 215 is 212 or 213: 2 or 3 left over.
    r.data.by_sex[0].share = g(0.99);
    expect(problem("affected", r, all())).toMatch(/share/);
  });

  it("a share over a hidden member fails", () => {
    const r = affected("all");
    r.data.by_age[0].patients = dr(HID);
    r.data.by_age[4].patients = dr(HID);
    expect(problem("affected", r, all())).toMatch(/share/);
  });

  it("severities that give one away fail; so do confidence and corrections", () => {
    const f = findings("all");
    f.data.alerts.by_severity.critical = HID;
    expect(problem("findings", f, all())).toMatch(/severity/);

    const q = quality("all");
    q.data.by_condition[0].confidence.low = HID;
    expect(problem("quality", q, all())).toMatch(/confidence/);

    const c = quality("all");
    c.data.by_condition[0].corrections.waiting = HID;
    expect(problem("quality", c, all())).toMatch(/corrections/);
  });

  it("existing cases of 1–4 (cases − new) fail, in both scopes", () => {
    for (const s of ["all", "hospital"] as const) {
      const r = prevalence(s);
      r.data.by_condition[0].new = g(147); // 150 − 147 = 3 existing
      expect(problem("prevalence", r, queryFor(s))).toMatch(/existing/);
      r.data.by_condition[0].new = g(145); // 5 existing reads
      expect(problem("prevalence", r, queryFor(s))).toBeNull();
      r.data.by_condition[0].new = HID; // hidden: nothing to subtract
      expect(problem("prevalence", r, queryFor(s))).toBeNull();
    }
  });

  it("unrated consultations of 1–4 (consultations − rated) fail, in both scopes", () => {
    for (const s of ["all", "hospital"] as const) {
      const q = quality(s);
      q.data.by_condition[0].consultations = g(102);
      q.data.by_condition[0].confidence = {
        high: g(60),
        medium: g(22),
        low: g(20),
      };
      expect(problem("quality", q, queryFor(s))).toMatch(/unrated/);
      q.data.by_condition[0].consultations = g(105);
      q.data.by_condition[0].confidence.high = g(63);
      expect(problem("quality", q, queryFor(s))).toBeNull();
    }
  });

  it("patients must be the patients seen with no condition filter (C2)", () => {
    // Patients hidden, its twin shown 215: female 212 gives male away.
    const r = affected("hospital");
    r.patients = HID;
    for (const k of [
      "by_age",
      "by_sex",
      "by_setting",
      "by_specialty",
      "by_location",
    ])
      for (const x of r.data[k]) x.share = HID;
    r.data.by_sex = [
      { sex: "female", patients: dr(g(212)), share: HID },
      { sex: "male", patients: dr(HID), share: HID },
      { sex: "other", patients: dr(g(0)), share: HID },
      { sex: "not_recorded", patients: dr(g(0)), share: HID },
    ];
    expect(problem("affected", r, one("h_havana"))).toMatch(/patients/);

    // A shown group beside a hidden headline base fails too.
    const p = prevalence("all");
    p.headline = { count: g(200), base: HID, per_1000: HID };
    p.hospitals[3].size = HID;
    p.hospitals[3].headline = { count: g(20), base: HID, per_1000: HID };
    expect(problem("prevalence", p, all())).toMatch(/patients|size/);
  });

  it("across hospitals, patients against the sizes, Quality included (C2)", () => {
    const q = quality("all");
    q.patients = g(2003);
    q.hospitals[2].size = HID;
    expect(problem("quality", q, all())).toMatch(/sizes/);
    const ok = quality("all");
    expect(problem("quality", ok, all())).toBeNull();
  });

  it("with a condition filter, patients is the headline count and that condition's cases (C2)", () => {
    const f = all({ condition: "e11" });
    const r = prevalence("all");
    r.patients = g(200);
    r.data.by_condition[0].cases = dr(g(200));
    r.data.by_condition[0].rate = rate(200, 2000);
    expect(problem("prevalence", r, f)).toBeNull();

    // The filtered condition's cases hidden while its twins show 200.
    r.data.by_condition[0].cases = dr(HID);
    r.data.by_condition[0].rate = { count: HID, base: g(2000), per_1000: HID };
    expect(problem("prevalence", r, f)).toMatch(/cases/);

    const w = prevalence("all");
    w.patients = g(150);
    expect(problem("prevalence", w, f)).toMatch(/patients/);
  });

  it("across hospitals a condition is a 3-character code or Not standardised (I2)", () => {
    const local = prevalence("all");
    local.data.by_condition[1].condition = {
      id: "sugar",
      name: "Sugar sickness",
      icd10: null,
    };
    expect(problem("prevalence", local, all())).toMatch(/3-character/);

    const fine = prevalence("all");
    fine.data.by_condition[1].condition = {
      id: "e11_9",
      name: "Type 2 diabetes",
      icd10: "E11.9",
    };
    expect(problem("prevalence", fine, all())).toMatch(/3-character/);
    // For one hospital, the finer code reads.
    const own = prevalence("hospital");
    own.data.by_condition[1].condition = fine.data.by_condition[1].condition;
    expect(problem("prevalence", own, one("h_havana"))).toBeNull();

    const pair = coOccurring("all");
    pair.data.pairs[0].b = { id: "x1", name: "Local term", icd10: null };
    expect(problem("co-occurring", pair, all())).toMatch(/3-character/);
  });

  it("any shown part of a shown whole leaves 0 or 5+ (the pair table)", () => {
    // Findings, condition filter: the group less its flagged patients.
    const f = findings("hospital");
    f.patients = g(202);
    expect(
      problem("findings", f, one("h_havana", { condition: "e11" })),
    ).toMatch(/group less the headline leaving 1–4/);
    // Prevalence: patients seen, but not in one month.
    const s = prevalence("hospital");
    s.data.series[4].rate = rate(40, 1998);
    expect(problem("prevalence", s, one("h_havana"))).toMatch(
      /not seen that month leaving 1–4/,
    );
    // Findings: flagged patients without one flagged finding.
    const k = findings("all");
    k.data.findings[0].patients = dr(g(198));
    k.data.findings[0].rate = rate(198, 2000);
    expect(problem("findings", k, all())).toMatch(
      /flagged less a finding leaving 1–4/,
    );
    // An unflagged finding isn't inside the flagged headline.
    k.data.findings[0].flag = null;
    expect(problem("findings", k, all())).toBeNull();
    // Co-occurring: the headline less a pair.
    const c = coOccurring("all");
    c.data.pairs[0].patients = dr(g(197));
    c.data.pairs[0].share_of_a = HID;
    expect(problem("co-occurring", c, all())).toMatch(
      /headline less a pair leaving 1–4/,
    );
    // A part over its whole fails too.
    const o = prevalence("all");
    o.data.by_condition[0].new = g(160);
    expect(problem("prevalence", o, all())).toMatch(/new/);
  });

  it("a total hidden for too few hospitals that the rows give away is a shown total (N2)", () => {
    const q = all({ condition: "e11" });
    const r = affected("all");
    r.patients = FEW;
    r.headline = { count: FEW, base: g(215), per_1000: FEW };
    const hide = (k: string, ...i: number[]) => {
      for (const x of r.data[k]) x.share = HID;
      for (const j of i) r.data[k][j].patients = dr(HID);
    };
    hide("by_age", 1, 2);
    hide("by_setting", 0, 1);
    hide("by_specialty", 0, 1);
    hide("by_sex", 0, 1);
    // The rows add up to 200: the group is 200, not secret.
    expect(problem("affected", r, q)).toBeNull();
    // Female 197 shown, male hidden: 200 − 197 = 3.
    r.data.by_sex[0].patients = dr(g(197));
    expect(problem("affected", r, q)).toMatch(/by_sex/);
  });

  it("a hidden total beside shown members reads, unless every member shows", () => {
    // Second hiding: 13 or more, hidden so a hospital reads the same in
    // both scopes; the two hidden values give neither away.
    const ok = quality("hospital");
    const row = ok.data.by_condition[0];
    row.consultations = HID;
    row.confidence = { high: HID, medium: g(80), low: g(20) };
    expect(problem("quality", ok, one("h_havana"))).toBeNull();

    row.confidence.high = g(200);
    expect(problem("quality", ok, one("h_havana"))).toMatch(/confidence/);
  });

  it("a shown 0 across hospitals comes from no hospital, and reads", () => {
    const q = quality("all");
    q.headline = {
      count: g(0),
      base: g(0),
      per_1000: { value: null, suppressed: false },
    };
    q.hospitals = q.hospitals.map((r: Raw) => ({
      ...r,
      headline: {
        count: g(0),
        base: g(0),
        per_1000: { value: null, suppressed: false },
      },
    }));
    q.data.by_condition = [];
    expect(problem("quality", q, all())).toBeNull();
  });

  it("an agreement rate that leaks the agreed count fails", () => {
    const q = quality("all");
    q.data.by_condition[0].agreement_rate = g(0.97);
    expect(problem("quality", q, all())).toMatch(/agreement/);
  });

  it("a share of the first condition that pins its patients fails", () => {
    const r = coOccurring("all");
    // 40 of 0.98 is 41 patients with the first: 1 more than the pair.
    r.data.pairs[0].share_of_a = g(0.98);
    expect(problem("co-occurring", r, all())).toMatch(/share_of_a/);
  });
});

describe("readView: across hospitals (Review Focus 2)", () => {
  /** Prevalence across hospitals whose headline count is 812. */
  function with812(counts: (number | null)[]) {
    const r = prevalence("all");
    const sizes = [2000, 2000, 2000, 2000];
    r.headline = rate(812, 8000);
    r.patients = g(8000);
    r.data.by_condition[0].rate = rate(150, 8000);
    r.data.by_condition[1].rate = rate(50, 8000);
    r.hospitals = counts.map((c, i) => ({
      ...row(`h_${i}`, `Hospital ${i}`, sizes[i], 0),
      headline:
        c === null
          ? { count: HID, base: g(sizes[i]), per_1000: HID }
          : rate(c, sizes[i]),
    }));
    return r;
  }

  it("the hand-made 812 reads when the rows add up", () => {
    expect(problem("prevalence", with812([400, 300, 100, 12]), all())).toBe(
      null,
    );
    expect(problem("prevalence", with812([400, 300, null, null]), all())).toBe(
      null,
    );
  });

  it("total 812, shown rows 809, two hidden rows fails", () => {
    const r = with812([400, 409, null, null]);
    expect(problem("prevalence", r, all())).toMatch(/remainder/);
    expect(read("prevalence", r, all()).status).toBe("failed");
  });

  it("exactly one hidden row fails", () => {
    expect(
      problem("prevalence", with812([400, 300, null, 100]), all()),
    ).toMatch(/remainder/);
    // Whatever the gap: 112 left over is still that one row.
    expect(
      problem("prevalence", with812([400, 200, null, 100]), all()),
    ).toMatch(/remainder/);
  });

  it("shown rows that don't add up to a shown total fail", () => {
    expect(problem("prevalence", with812([400, 300, 100, 10]), all())).toMatch(
      /remainder/,
    );
  });

  it("a shown total from 2 hospitals fails", () => {
    const r = with812([400, 412, 0, 0]);
    expect(problem("prevalence", r, all())).toMatch(/fewer than 3/);
  });

  it("the base and the sizes are checked too, not only the count", () => {
    const base = prevalence("all");
    base.hospitals[3].headline = { count: HID, base: HID, per_1000: HID };
    base.hospitals[3].size = HID;
    expect(problem("prevalence", base, all())).toMatch(/remainder/);

    const size = prevalence("all");
    size.hospitals[3].size = HID;
    expect(problem("prevalence", size, all())).toMatch(/size/);
  });

  it("two rows for the same hospital fail", () => {
    const r = prevalence("all");
    r.hospitals[3].hospital = r.hospitals[0].hospital;
    expect(problem("prevalence", r, all())).toMatch(/hospital/);
  });

  it("partly standardised must agree with a shown share over 10%", () => {
    const r = prevalence("all");
    r.hospitals[0].not_standardised_share = g(0.14);
    expect(problem("prevalence", r, all())).toMatch(/partly/);
    r.hospitals[0].partly_standardised = true;
    expect(problem("prevalence", r, all())).toBeNull();
    r.hospitals[0].not_standardised_share = g(0.04);
    expect(problem("prevalence", r, all())).toMatch(/partly/);
  });

  it("too_few_hospitals reads; `why` on a shown value fails", () => {
    const ok = prevalence("all");
    ok.headline = { count: FEW, base: g(2000), per_1000: FEW };
    ok.hospitals = ROWS();
    expect(problem("prevalence", ok, all())).toBeNull();

    const shown = prevalence("all");
    shown.data.by_condition[0].new = { ...g(30), why: "too_few_hospitals" };
    expect(problem("prevalence", shown, all())).toMatch(/why/);

    const other = prevalence("all");
    other.data.by_condition[0].new = { ...HID, why: "small" };
    expect(problem("prevalence", other, all())).toMatch(/why/);
  });

  it("`why` anywhere in hospital scope, or in a hospital row, fails", () => {
    const r = prevalence("hospital");
    r.data.by_condition[1].new = FEW;
    expect(problem("prevalence", r, one("h_havana"))).toMatch(/why/);

    const rows = prevalence("all");
    rows.hospitals[0].not_standardised_share = FEW;
    expect(problem("prevalence", rows, all())).toMatch(/why/);
  });

  it("two 'Not standardised' conditions across hospitals fail", () => {
    const r = prevalence("all");
    r.data.by_condition.push(
      {
        condition: { id: "unmapped", name: null, icd10: null },
        cases: dr(g(0)),
        rate: rate(0, 2000),
        new: g(0),
      },
      {
        condition: { id: "unmapped_2", name: null, icd10: null },
        cases: dr(g(0)),
        rate: rate(0, 2000),
        new: g(0),
      },
    );
    expect(problem("prevalence", r, all())).toMatch(/Not standardised/);
    // One is fine.
    r.data.by_condition.pop();
    expect(problem("prevalence", r, all())).toBeNull();
  });

  it("a drill across hospitals fails", () => {
    const r = prevalence("all");
    r.data.by_condition[0].cases.drill = "d_e11";
    expect(problem("prevalence", r, all())).toMatch(/drill/);
  });

  it("a comparison, a hospital, a ward breakdown or a series median across hospitals fails", () => {
    const c = prevalence("all");
    c.comparison = comparison();
    expect(problem("prevalence", c, all())).toMatch(/comparison/);

    const h = prevalence("all");
    h.hospital = HAVANA;
    expect(problem("prevalence", h, all())).toMatch(/hospital/);

    const a = affected("all");
    a.data.by_location = affected("hospital").data.by_location;
    expect(problem("affected", a, all())).toMatch(/by_location/);

    const m = prevalence("all");
    m.data.series[0].median = g(70);
    expect(problem("prevalence", m, all())).toMatch(/median/);

    const none = prevalence("all");
    none.hospitals = null;
    expect(problem("prevalence", none, all())).toMatch(/hospitals/);
  });
});

describe("readView: one hospital (Review Focus 3)", () => {
  const H = one("h_havana");
  /** Not available: no median, no verdict, and no median on the series. */
  function notAvailable(over: Raw) {
    const r = prevalence("hospital");
    r.comparison = {
      ...r.comparison,
      available: false,
      reason: "too_few_peers",
      peers: 3,
      median: HID,
      verdict: null,
      ...over,
    };
    for (const s of r.data.series) s.median = null;
    return r;
  }

  it("an honest not-available comparison reads", () => {
    expect(problem("prevalence", notAvailable({}), H)).toBeNull();
  });

  it("available with peers 4 fails; a median with available false fails; a comparison in Who is affected fails", () => {
    const four = prevalence("hospital");
    four.comparison.peers = 4;
    expect(problem("prevalence", four, H)).toMatch(/peers/);

    const half = prevalence("hospital");
    half.comparison.peers = 5.5;
    expect(problem("prevalence", half, H)).toMatch(/peers/);

    const names = prevalence("hospital");
    names.comparison.peers = ["Northgate", "Westfield"];
    expect(problem("prevalence", names, H)).toMatch(/peers/);

    const median = notAvailable({ peers: 4, median: g(95) });
    expect(problem("prevalence", median, H)).toMatch(/median/);

    for (const view of ["affected", "co-occurring"] as const) {
      const r = MADE[view]("hospital");
      r.comparison = comparison();
      expect(problem(view, r, H)).toMatch(/comparison/);
    }
  });

  it("a verdict with available false fails", () => {
    const r = notAvailable({
      reason: "partly_standardised",
      peers: null,
      verdict: "about_same",
    });
    expect(problem("prevalence", r, H)).toMatch(/verdict/);
  });

  it("a reason that disagrees with available fails", () => {
    const yes = prevalence("hospital");
    yes.comparison.reason = "too_few_peers";
    expect(problem("prevalence", yes, H)).toMatch(/reason/);

    const no = notAvailable({ reason: null, peers: null });
    expect(problem("prevalence", no, H)).toMatch(/reason/);

    const other = notAvailable({ reason: "busy" });
    expect(problem("prevalence", other, H)).toMatch(/reason/);
  });

  it("a series median shows only beside an available comparison", () => {
    const r = notAvailable({});
    r.data.series[0].median = g(70);
    expect(problem("prevalence", r, H)).toMatch(/median/);
  });

  it("the previous period may be empty: no earlier data, not hidden", () => {
    const r = prevalence("hospital");
    r.comparison.previous = { value: null, suppressed: false };
    expect(problem("prevalence", r, H)).toBeNull();
  });

  it("a comparison that doesn't match the headline fails", () => {
    const r = prevalence("hospital");
    r.comparison.current = g(55);
    expect(problem("prevalence", r, H)).toMatch(/current/);
  });

  it("a hospital list in one hospital fails", () => {
    const r = prevalence("hospital");
    r.hospitals = ROWS();
    expect(problem("prevalence", r, H)).toMatch(/hospitals/);
  });

  it("a drill on a hidden value or a count under 5 fails; one on 150 reads", () => {
    const ok = prevalence("hospital");
    ok.data.by_condition[0].cases.drill = "d_e11";
    expect(problem("prevalence", ok, H)).toBeNull();

    const hid = affected("hospital");
    hid.data.by_age[0].patients = { ...HID, drill: "d_x" };
    hid.data.by_age[4].patients = dr(HID);
    hid.data.by_age[0].share = HID;
    hid.data.by_age[4].share = HID;
    expect(problem("affected", hid, H)).toMatch(/drill/);

    const zero = affected("hospital");
    zero.data.by_sex[2].patients.drill = "d_x";
    expect(problem("affected", zero, H)).toMatch(/drill/);
  });
});

describe("readView: lists, periods and patient fields", () => {
  it("a 21st pair fails; a shown pair after a hidden one fails", () => {
    expect(problem("co-occurring", coOccurring("all", 20), all())).toBeNull();
    expect(problem("co-occurring", coOccurring("all", 21), all())).toMatch(
      /20/,
    );
    const r = coOccurring("all");
    r.data.pairs[1].patients = dr(HID);
    r.data.pairs[1].share_of_a = HID;
    expect(problem("co-occurring", r, all())).toMatch(/after a hidden/);
    // Hidden last reads.
    r.data.pairs.push(r.data.pairs.splice(1, 1)[0]);
    expect(problem("co-occurring", r, all())).toBeNull();
  });

  it("the same pair twice, either way round, fails", () => {
    const r = coOccurring("all");
    r.data.pairs[1] = { ...r.data.pairs[0], a: r.data.pairs[0].b, b: E11 };
    expect(problem("co-occurring", r, all())).toMatch(/twice/);
  });

  it("a period that isn't whole months fails", () => {
    const cases: [string, string][] = [
      ["2025-10-02", "2026-09-30"], // not the first of a month
      ["2025-10-01", "2026-09-29"], // not the last of a month
      ["2026-04-01", "2026-09-30"], // 6 months for Last 12 months
      ["2025-11-01", "2026-10-31"], // ends this month, not the last
      ["2025-09-01", "2026-08-31"], // ends two months ago
      ["2025-10-01", "2026-09-31"], // not a day
    ];
    for (const [from, to] of cases) {
      const r = prevalence("all");
      r.period = { from, to };
      expect(problem("prevalence", r, all())).toMatch(/period/);
    }
    const six = prevalence("all");
    six.period = { from: "2026-04-01", to: "2026-09-30" };
    six.data.series = six.data.series.slice(6);
    expect(problem("prevalence", six, all({ period: "6m" }))).toBeNull();
  });

  it("series months must be the period's months, in order", () => {
    const r = prevalence("all");
    r.data.series = r.data.series.slice(1);
    expect(problem("prevalence", r, all())).toMatch(/series/);
  });

  it("a `pid` key anywhere fails", () => {
    for (const key of [
      "pid",
      "mrn",
      "dob",
      "date_of_birth",
      "address",
      "patient_name",
    ]) {
      const r = prevalence("all");
      r.data.by_condition[0].condition[key] = "x";
      expect(problem("prevalence", r, all())).toMatch(new RegExp(key));
      const top = prevalence("hospital");
      top[key] = null;
      expect(problem("prevalence", top, one("h_havana"))).toMatch(
        new RegExp(key),
      );
    }
  });
});

// ---- The mock's own replies --------------------------------------------------

describe("the mock's replies all read, over a grid", () => {
  const PERIODS: AnalysisPeriod[] = ["3m", "6m", "12m"];
  const ALL_FILTERS: Partial<AnalysisQuery>[] = [
    {},
    ...["0-19", "20-39", "40-59", "60-79", "80+"].map((b) => ({
      age_band: b as AnalysisQuery["age_band"],
    })),
    ...["female", "male", "other", "not_recorded"].map((s) => ({
      sex: s as AnalysisQuery["sex"],
    })),
    ...["admitted", "outpatient", "emergency"].map((s) => ({
      setting: s as AnalysisQuery["setting"],
    })),
    // The planted conditions: Sickle cell (second hiding), Tuberculosis
    // (too few hospitals), the rare pair's Chronic kidney disease.
    { condition: "d57" },
    { condition: "a15" },
    { condition: "n18" },
    { condition: "e11", sex: "female", setting: "admitted" },
    { specialty: "General medicine" },
  ];
  const ONE_FILTERS = (id: string): Partial<AnalysisQuery>[] => [
    {},
    ...["0-17", "18-39", "40-64", "65-79", "80+"].map((b) => ({
      age_band: b as AnalysisQuery["age_band"],
    })),
    ...["female", "male", "other", "not_recorded"].map((s) => ({
      sex: s as AnalysisQuery["sex"],
    })),
    ...["admitted", "outpatient", "emergency"].map((s) => ({
      setting: s as AnalysisQuery["setting"],
    })),
    { condition: "d57" },
    { condition: "a15" },
    { condition: "n18" },
    { condition: "unmapped" },
    { location: LOCATIONS[0].id },
    { specialty: "General medicine" },
    { sex: "female", setting: "admitted", age_band: "40-64" },
    {
      sex: "male",
      setting: "outpatient",
      age_band: "65-79",
      specialty: "General medicine",
    },
    ...(PROFILES.find((p) => p.id === id)!.sources.length > 1
      ? [{ source: "results_system" }]
      : []),
  ];

  for (const period of PERIODS)
    it(`every view, both scopes: ${period}`, async () => {
      const m = mock();
      const bad: string[] = [];
      const queries = [
        ...ALL_FILTERS.map((f) => all({ period, ...f })),
        ...PROFILES.flatMap((p) =>
          ONE_FILTERS(p.id).map((f) => one(p.id, { period, ...f })),
        ),
      ];
      let read = 0;
      for (const q of queries)
        for (const view of VIEW_IDS) {
          const raw = await m.getAnalysisView(view, q);
          const why = viewProblem(view, raw, q, NOW);
          if (why) bad.push(`${view} ${JSON.stringify(q)}: ${why}`);
          else read++;
        }
      expect(bad.slice(0, 20).join("\n")).toBe("");
      expect(read).toBe(queries.length * VIEW_IDS.length);
    });

  const small = (n: number) => n > 0 && n < 5;
  /** The one-hospital query that asks the same as an all-hospitals one. */
  const twinOf = (q: AnalysisQuery): Partial<AnalysisQuery> | null =>
    q.age_band !== null && q.age_band !== "80+"
      ? null
      : {
          period: q.period,
          condition: q.condition,
          age_band: q.age_band,
          sex: q.sex,
          setting: q.setting,
          specialty: q.specialty,
        };

  const shownValue = (g: AGuarded) =>
    !g.suppressed && g.value !== null ? g.value : null;
  /** A hospital's rest for a pair its reply doesn't list: none, or unknown. */
  const SPARSE = new Set(["condition", "member", "series", "quality"]);

  for (const period of PERIODS)
    it(`every part-pair of the table leaves 0 or 5+, in a reply or across scopes: ${period}`, async () => {
      expect(PART_PAIR_COUNT).toBe(39);
      const m = mock();
      const leaks: string[] = [];
      const figs = async (view: ViewId, q: AnalysisQuery) =>
        figuresOf(await m.getAnalysisView(view, q));
      const name = (x: { pair: PartPair; part: FigureItem }) =>
        `${x.pair.whole} ⊇ ${x.pair.part} ${x.part.key}`;
      for (const view of VIEW_IDS) {
        // Inside each reply.
        const queries = [
          ...ALL_FILTERS.map((f) => all({ period, ...f })),
          ...PROFILES.flatMap((p) =>
            ONE_FILTERS(p.id).map((f) => one(p.id, { period, ...f })),
          ),
        ];
        for (const q of queries)
          for (const x of pairInstances(view, await figs(view, q))) {
            const w = shownValue(x.whole.value);
            const pt = shownValue(x.part.value);
            if (w !== null && pt !== null && (w < pt || small(w - pt)))
              leaks.push(`${view} ${JSON.stringify(q)} ${name(x)}: ${w - pt}`);
          }
        // Across scopes: the all-hospitals rest less every hospital's own.
        for (const f of ALL_FILTERS) {
          const q = all({ period, ...f });
          const twin = twinOf(q);
          if (!twin) continue;
          const whole = pairInstances(view, await figs(view, q));
          const each = await Promise.all(
            PROFILES.map(async (p) => {
              const fs = await figs(view, one(p.id, twin));
              return { fs, list: pairInstances(view, fs) };
            }),
          );
          for (const x of whole) {
            const w = shownValue(x.whole.value);
            const pt = shownValue(x.part.value);
            if (w === null || pt === null) continue;
            if (x.part.across === null || x.whole.across === null) continue;
            let known = 0;
            let unknown = 0;
            for (const h of each) {
              const y = h.list.find(
                (z) =>
                  z.pair === x.pair &&
                  z.part.across === x.part.across &&
                  (familyOfFigure(x.pair.whole) === null ||
                    z.whole.across === x.whole.across),
              );
              let rest: number | null;
              if (y) {
                const a = shownValue(y.whole.value);
                const b = shownValue(y.part.value);
                rest = a !== null && b !== null ? a - b : null;
              } else if (!SPARSE.has(familyOfFigure(x.pair.part)!)) rest = null;
              else if (familyOfFigure(x.pair.whole) !== null) rest = 0;
              else {
                // Not listed: none of the part, so the rest is the whole.
                const wh = h.fs.get(x.pair.whole)?.[0];
                rest = wh ? shownValue(wh.value) : null;
              }
              if (rest === null) unknown++;
              else known += rest;
            }
            if (unknown > 0 && small(w - pt - known))
              leaks.push(
                `${view} across ${JSON.stringify(f)} ${name(x)}: ${w - pt - known} over ${unknown} hospitals`,
              );
          }
        }
      }
      expect(`${leaks.length} leaks\n${leaks.slice(0, 15).join("\n")}`).toBe(
        "0 leaks\n",
      );
    });

  it("the planted cases read as planted", async () => {
    const m = mock();
    const tb = read(
      "prevalence",
      await m.getAnalysisView("prevalence", all({ condition: "a15" })),
      all({ condition: "a15" }),
    );
    expect(tb.status).toBe("ok");
    if (tb.status !== "ok") return;
    expect(tb.data.headline.count.why).toBe("too_few_hospitals");

    const sc = read(
      "prevalence",
      await m.getAnalysisView("prevalence", all({ condition: "d57" })),
      all({ condition: "d57" }),
    );
    expect(sc.status).toBe("ok");
  });

  it("the filter options read in both scopes; the status reads", async () => {
    const m = mock();
    expect(readStatus(await m.getAnalysisStatus()).status).toBe("ok");
    expect(
      readFilterOptions(await m.getAnalysisFilters("all", null), "all").status,
    ).toBe("ok");
    for (const p of PROFILES)
      expect(
        readFilterOptions(
          await m.getAnalysisFilters("hospital", p.id),
          "hospital",
        ).status,
      ).toBe("ok");
  });

  it("an unavailable view fails, a mock reply read keeps only its keys", async () => {
    const m = mock();
    const raw = clone(await m.getAnalysisView("findings", all()));
    expect(read("findings", raw, all()).status).toBe("ok");
    expect(read("findings", { unavailable: true }, all()).status).toBe(
      "failed",
    );
  });
});

// ---- The status and the filter options ------------------------------------------

describe("readStatus", () => {
  const status = () => ({
    aggregates_enabled: true,
    patient_views_enabled: true,
    sample: true,
    hospitals: {
      included: 2,
      total: 3,
      list: [HAVANA, { id: "h_northgate", name: "Northgate Hospital" }],
      excluded: [
        { id: "h_hilltop", name: "Hilltop Hospital", reason: "not_covered" },
      ],
    },
    my_clearances: [] as unknown[],
  });

  it("reads a good status", () => {
    expect(readStatus(status()).status).toBe("ok");
  });

  it("status: included must equal the list", () => {
    const s = status();
    s.hospitals.included = 3;
    expect(readStatus(s).status).toBe("failed");
  });

  it("fails on an unknown excluded reason, an extra key, or a clearance elsewhere", () => {
    const r = status();
    (r.hospitals.excluded[0] as Raw).reason = "paused";
    expect(readStatus(r).status).toBe("failed");

    const x = status() as Raw;
    x.extra = 1;
    expect(readStatus(x).status).toBe("failed");

    const c = status();
    c.my_clearances = [
      {
        hospital: { id: "h_hilltop", name: "Hilltop Hospital" },
        clearance_id: "cl_1",
        until: "2027-01-01",
      },
    ];
    expect(readStatus(c).status).toBe("failed");
    c.my_clearances = [
      { hospital: HAVANA, clearance_id: "cl_1", until: "2027-01-01" },
    ];
    expect(readStatus(c).status).toBe("ok");
  });

  it("fails when the total doesn't match the included and the excluded", () => {
    const s = status();
    s.hospitals.total = 4;
    expect(readStatus(s).status).toBe("failed");
  });
});

describe("readFilterOptions", () => {
  const options = () => ({
    updated_at: "2026-10-23T09:30:00.000Z",
    conditions: [E11, { id: "unmapped", name: null, icd10: null }],
    specialties: ["Cardiology"],
    locations: [] as unknown[],
    sources: [] as unknown[],
  });

  it("across hospitals: no locations or sources, one source fails for one hospital", () => {
    expect(readFilterOptions(options(), "all").status).toBe("ok");
    const loc = options();
    loc.locations = [LOCATIONS[0]];
    expect(readFilterOptions(loc, "all").status).toBe("failed");
    expect(readFilterOptions(loc, "hospital").status).toBe("ok");
    const src = options();
    src.sources = [{ id: "main_record", label: "Main record" }];
    expect(readFilterOptions(src, "hospital").status).toBe("failed");
    expect(readFilterOptions(src, "all").status).toBe("failed");
  });

  it("across hospitals a condition is a 3-character code", () => {
    const o = options();
    o.conditions = [{ id: "j18_9", name: "Pneumonia", icd10: "J18.9" }];
    expect(readFilterOptions(o, "all").status).toBe("failed");
    expect(readFilterOptions(o, "hospital").status).toBe("ok");
  });
});
