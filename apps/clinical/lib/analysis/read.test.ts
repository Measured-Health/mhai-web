import { describe, expect, it } from "vitest";
import type { GuardedOut } from "../api/admin-contract";
import type {
  AffectedOut,
  AgeBand,
  AnalysisFilters,
  CoOccurringOut,
  Drillable,
  FindingsOut,
  Meta,
  PrevalenceOut,
  QualityOut,
  Setting,
  Sex,
  ViewId,
} from "../api/analysis-contract";
import { FILTER_OPTIONS } from "../api/analysis-fixtures";
import { createMockAnalysis } from "../api/mock-analysis";
import {
  readClearanceMe,
  readFilterOptions,
  readPatients,
  readView,
} from "./read";

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const NONE: GuardedOut = { value: null, suppressed: false };
const D = (g: GuardedOut, drill: string | null = null): Drillable => ({
  ...g,
  drill,
});

const F: AnalysisFilters = {
  from: "2025-10-22",
  to: "2026-10-21",
  condition: null,
  age_band: null,
  sex: null,
  location: null,
  setting: null,
  specialty: null,
  source: null,
};
const VIEWS: ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
const mock = createMockAnalysis({ delayMs: 0 });
/** The reader's clock in these tests. */
const NOW = Date.parse("2026-10-22T09:00:00.000Z");

const meta = (patients: GuardedOut): Meta => ({
  updated_at: "2026-10-22T06:00:00.000Z",
  from: "2026-07-24",
  to: "2026-10-22",
  bucket: "week",
  patients,
});
const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };
const I10 = { id: "i10", name: "Hypertension", icd10: "I10" };

function prevalence(over: Partial<PrevalenceOut> = {}): PrevalenceOut {
  return {
    ...meta(S(300)),
    total: { cases: S(120), new: S(30), existing: S(90) },
    by_condition: [
      {
        condition: E11,
        cases: D(S(60), "cond-e11"),
        new: S(10),
        existing: S(50),
      },
    ],
    series: [
      { start: "2026-07-24", cases: S(20), new: S(5) },
      { start: "2026-07-31", cases: H, new: H },
      { start: "2026-08-07", cases: S(0), new: S(0) },
    ],
    ...over,
  };
}

function affected(over: Partial<AffectedOut> = {}): AffectedOut {
  return {
    ...meta(S(215)),
    by_age: [
      { band: "0-17", patients: D(S(0)) },
      { band: "18-39", patients: D(S(15), "age-18to39") },
      { band: "40-64", patients: D(S(200), "age-40to64") },
      { band: "65-79", patients: D(S(0)) },
      { band: "80+", patients: D(S(0)) },
    ],
    by_sex: [
      { sex: "female", patients: D(S(110), "sex-female") },
      { sex: "male", patients: D(S(105), "sex-male") },
      { sex: "other", patients: D(S(0)) },
      { sex: "not_recorded", patients: D(S(0)) },
    ],
    by_setting: [
      { setting: "admitted", patients: D(S(215), "setting-admitted") },
      { setting: "outpatient", patients: D(S(0)) },
      { setting: "emergency", patients: D(S(0)) },
    ],
    by_location: [
      {
        location: {
          id: "ward4",
          label: "Ward 4 (Medical)",
          setting: "admitted",
        },
        patients: D(S(200), "loc-ward4"),
      },
      { location: null, patients: D(S(15), "loc-none") },
    ],
    by_specialty: [{ specialty: "Cardiology", patients: D(S(215), "spec-c") }],
    ...over,
  };
}

function coOccurring(over: Partial<CoOccurringOut["pairs"][number]> = {}) {
  const v: CoOccurringOut = {
    ...meta(S(300)),
    pairs: [
      {
        a: E11,
        b: I10,
        a_patients: S(100),
        patients: D(S(40), "pair-e11-i10"),
        share_of_a: S(0.4),
        ...over,
      },
    ],
  };
  return v;
}

function findings(over: Partial<FindingsOut["alerts"]> = {}): FindingsOut {
  return {
    ...meta(S(300)),
    findings: [
      {
        name: "Potassium",
        flag: "high",
        patients: D(S(12), "finding-k"),
        results: S(20),
      },
      { name: null, flag: null, patients: D(H), results: H },
    ],
    alerts: {
      total: S(40),
      by_severity: { critical: S(10), urgent: S(20), info: S(10) },
      median_ack_minutes: S(12.5),
      critical_median_ack_minutes: S(6),
      dismissed: S(10),
      dismiss_reasons: [
        { reason: "not_relevant", count: S(10) },
        { reason: "already_known", count: S(0) },
        { reason: "wrong_patient", count: S(0) },
        { reason: "other", count: S(0) },
      ],
      ...over,
    },
  };
}

function quality(
  over: Partial<QualityOut["by_condition"][number]> = {},
): QualityOut {
  return {
    ...meta(S(300)),
    by_condition: [
      {
        condition: E11,
        consultations: S(40),
        confidence: {
          high: S(20),
          caution: S(10),
          review: S(10),
          failed: S(0),
        },
        agreement_rate: S(0.75),
        rated: S(20),
        corrections: {
          total: S(10),
          approved: S(5),
          rejected: S(5),
          waiting: S(0),
        },
        ...over,
      },
    ],
  };
}

const ok = (v: ViewId, raw: unknown) => readView(v, raw).status;

describe("readView", () => {
  it("reads well-formed views", () => {
    expect(ok("prevalence", prevalence())).toBe("ok");
    expect(ok("affected", affected())).toBe("ok");
    expect(ok("co-occurring", coOccurring())).toBe("ok");
    expect(ok("findings", findings())).toBe("ok");
    expect(ok("quality", quality())).toBe("ok");
  });

  it("0 shows, 1–4 hidden", () => {
    const r = readView("prevalence", prevalence());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.series[1].cases).toEqual(H);
    expect(r.data.series[2].cases).toEqual(S(0));
  });

  it("an unsuppressed 3 fails the view closed", () => {
    const v = prevalence();
    v.series[0].new = S(3);
    expect(ok("prevalence", v)).toBe("failed");
    expect(ok("affected", { ...affected(), patients: S(3) })).toBe("failed");
  });

  it("a count of 12.5 fails; a median of 12.5 minutes reads", () => {
    const v = prevalence();
    v.series[0].cases = S(12.5);
    expect(ok("prevalence", v)).toBe("failed");
    expect(ok("findings", findings({ median_ack_minutes: S(12.5) }))).toBe(
      "ok",
    );
  });

  it("female 212, male hidden, total 215 fails who is affected", () => {
    const v = affected({
      by_sex: [
        { sex: "female", patients: D(S(212), "sex-female") },
        { sex: "male", patients: D(H) },
        { sex: "other", patients: D(S(0)) },
        { sex: "not_recorded", patients: D(S(0)) },
      ],
    });
    expect(ok("affected", v)).toBe("failed");
  });

  it("new shown, existing hidden, cases − new = 3 fails prevalence", () => {
    expect(
      ok(
        "prevalence",
        prevalence({ total: { cases: S(120), new: S(117), existing: H } }),
      ),
    ).toBe("failed");
    const v = prevalence();
    v.by_condition[0] = { ...v.by_condition[0], new: S(57), existing: H };
    expect(ok("prevalence", v)).toBe("failed");
  });

  it("one hidden severity fails findings", () => {
    expect(
      ok(
        "findings",
        findings({ by_severity: { critical: H, urgent: S(20), info: S(17) } }),
      ),
    ).toBe("failed");
  });

  it("each set that adds up fails on one hidden member", () => {
    const one = (v: ViewId, raw: unknown) =>
      expect(ok(v, raw), `${v} ${JSON.stringify(raw).slice(0, 80)}`).toBe(
        "failed",
      );
    one(
      "affected",
      affected({
        by_age: [
          { band: "0-17", patients: D(H) },
          { band: "18-39", patients: D(S(15), "a") },
          { band: "40-64", patients: D(S(198), "b") },
          { band: "65-79", patients: D(S(0)) },
          { band: "80+", patients: D(S(0)) },
        ],
      }),
    );
    one(
      "affected",
      affected({
        by_setting: [
          { setting: "admitted", patients: D(S(212), "s") },
          { setting: null, patients: D(H) },
        ],
      }),
    );
    one(
      "affected",
      affected({
        by_location: [
          { location: null, patients: D(H) },
          { location: null, patients: D(S(212), "l") },
        ],
      }),
    );
    one(
      "affected",
      affected({
        by_specialty: [
          { specialty: "Cardiology", patients: D(S(212), "c") },
          { specialty: null, patients: D(H) },
        ],
      }),
    );
    one(
      "findings",
      findings({
        dismiss_reasons: [
          { reason: "not_relevant", count: S(7) },
          { reason: "already_known", count: H },
          { reason: "wrong_patient", count: S(0) },
          { reason: "other", count: S(0) },
        ],
      }),
    );
    one(
      "quality",
      quality({
        confidence: { high: S(20), caution: S(17), review: H, failed: S(0) },
      }),
    );
    one(
      "quality",
      quality({
        corrections: {
          total: S(10),
          approved: S(7),
          rejected: H,
          waiting: S(0),
        },
      }),
    );
  });

  it("a repeated group fails, so two hidden rows can't be added up", () => {
    // Male = 26 − 20 − ... = 3, counted twice as "Fewer than 5".
    expect(
      ok(
        "affected",
        affected({
          patients: S(26),
          by_age: [{ band: "40-64", patients: D(S(26), "a") }],
          by_sex: [
            { sex: "female", patients: D(S(20), "f") },
            { sex: "male", patients: D(H) },
            { sex: "male", patients: D(H) },
            { sex: "other", patients: D(S(0)) },
            { sex: "not_recorded", patients: D(S(0)) },
          ],
          by_setting: [{ setting: "admitted", patients: D(S(26), "s") }],
          by_location: [{ location: null, patients: D(S(26), "l") }],
          by_specialty: [{ specialty: null, patients: D(S(26), "c") }],
        }),
      ),
    ).toBe("failed");
    const twoNulls = affected({
      by_setting: [
        { setting: "admitted", patients: D(S(205), "s") },
        { setting: null, patients: D(H) },
        { setting: null, patients: D(H) },
      ],
    });
    expect(ok("affected", twoNulls)).toBe("failed");
    const twoLocations = affected();
    twoLocations.by_location = [
      twoLocations.by_location[0],
      { ...twoLocations.by_location[0], patients: D(S(15), "x") },
    ];
    expect(ok("affected", twoLocations)).toBe("failed");
    expect(
      ok(
        "findings",
        findings({
          dismiss_reasons: [
            { reason: "not_relevant", count: S(0) },
            { reason: "not_relevant", count: S(10) },
          ],
        }),
      ),
    ).toBe("failed");
    const week = prevalence();
    week.series[2].start = week.series[0].start;
    expect(ok("prevalence", week)).toBe("failed");
    const cond = prevalence();
    cond.by_condition.push({ ...cond.by_condition[0], cases: D(S(60)) });
    expect(ok("prevalence", cond)).toBe("failed");
    const pair = coOccurring();
    pair.pairs.push({ ...pair.pairs[0], a: I10, b: E11 });
    expect(ok("co-occurring", pair)).toBe("failed");
    const finding = findings();
    finding.findings.push({ ...finding.findings[0], patients: D(S(6)) });
    expect(ok("findings", finding)).toBe("failed");
    const q = quality();
    q.by_condition.push(q.by_condition[0]);
    expect(ok("quality", q)).toBe("failed");
    expect(
      readFilterOptions({
        ...FILTER_OPTIONS,
        sources: [FILTER_OPTIONS.sources[0], FILTER_OPTIONS.sources[0]],
      }).status,
    ).toBe("failed");
  });

  it("a week with cases − new = 3 fails prevalence", () => {
    const v = prevalence();
    v.series[0] = { start: "2026-07-24", cases: S(10), new: S(7) };
    expect(ok("prevalence", v)).toBe("failed");
    const over = prevalence();
    over.series[0] = { start: "2026-07-24", cases: S(10), new: S(12) };
    expect(ok("prevalence", over)).toBe("failed");
    const under = prevalence();
    under.series[0] = { start: "2026-07-24", cases: H, new: S(7) };
    expect(ok("prevalence", under)).toBe("failed");
    const fine = prevalence();
    fine.series[0] = { start: "2026-07-24", cases: S(12), new: H };
    expect(ok("prevalence", fine)).toBe("ok");
  });

  it("dismissed is part of all alerts: more, or a rest of 1–4, fails", () => {
    expect(ok("findings", findings({ dismissed: S(41) }))).toBe("failed");
    const three = findings({
      dismissed: S(37),
      dismiss_reasons: [{ reason: "other", count: S(37) }],
    });
    expect(ok("findings", three)).toBe("failed");
    expect(
      ok(
        "findings",
        findings({
          total: H,
          by_severity: { critical: H, urgent: S(0), info: S(0) },
          median_ack_minutes: H,
          critical_median_ack_minutes: H,
          dismissed: S(5),
          dismiss_reasons: [{ reason: "other", count: S(5) }],
        }),
      ),
    ).toBe("failed");
  });

  it("rated is part of the consultations: more, or a rest of 1–4, fails", () => {
    expect(
      ok("quality", quality({ rated: S(41), agreement_rate: S(0.5) })),
    ).toBe("failed");
    expect(
      ok("quality", quality({ rated: S(37), agreement_rate: S(0.49) })),
    ).toBe("failed");
  });

  it("drops keys outside the contract", () => {
    const v = {
      ...prevalence(),
      extra: [{ name: "Jane Doe" }],
      x: { value: 9, suppressed: false },
    };
    v.by_condition[0] = {
      ...v.by_condition[0],
      condition: { ...E11, note: "Jane Doe" } as typeof E11,
    };
    const r = readView("prevalence", v);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(JSON.stringify(r.data)).not.toContain("Jane Doe");
    expect(r.data).not.toHaveProperty("extra");
    expect(r.data).not.toHaveProperty("x");
    expect(r.data).toEqual(prevalence());
  });

  it("total.new with a drill loses the drill", () => {
    const v = prevalence();
    v.total.new = { value: 30, suppressed: false, drill: "x" } as GuardedOut;
    const r = readView("prevalence", v);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.data.total.new).toEqual(S(30));
      expect(r.data.by_condition[0].cases.drill).toBe("cond-e11");
    }
  });

  it("each view's output is exactly its input when nothing extra is sent", async () => {
    for (const view of VIEWS) {
      const raw = await mock.getView(view, F);
      const r = readView(view, raw);
      expect(r).toEqual({ status: "ok", data: raw });
    }
  });

  it("a median that isn't whole or a half fails", () => {
    expect(ok("findings", findings({ median_ack_minutes: S(12.3) }))).toBe(
      "failed",
    );
  });

  it("hidden members that add up to 1–4 fail", () => {
    const v = affected({
      by_age: [
        { band: "0-17", patients: D(H) },
        { band: "18-39", patients: D(H) },
        { band: "40-64", patients: D(S(211), "b") },
        { band: "65-79", patients: D(S(0)) },
        { band: "80+", patients: D(S(0)) },
      ],
    });
    expect(ok("affected", v)).toBe("failed");
  });

  it("an agreement rate over a hidden count fails", () => {
    expect(ok("quality", quality({ rated: H }))).toBe("failed");
    expect(
      ok(
        "findings",
        findings({
          total: H,
          by_severity: { critical: H, urgent: H, info: S(0) },
          dismissed: S(0),
          dismiss_reasons: [],
        }),
      ),
    ).toBe("failed");
    expect(
      ok(
        "findings",
        findings({
          by_severity: { critical: H, urgent: H, info: S(30) },
          critical_median_ack_minutes: S(6),
        }),
      ),
    ).toBe("failed");
    expect(
      ok("co-occurring", coOccurring({ patients: D(H), share_of_a: S(0.04) })),
    ).toBe("failed");
  });

  it("a share with nothing rated reads", () => {
    expect(ok("quality", quality({ rated: S(0), agreement_rate: NONE }))).toBe(
      "ok",
    );
  });

  it("a share of a shown count that gives away 1–4, or its complement, fails", () => {
    expect(ok("quality", quality({ agreement_rate: S(0.15) }))).toBe("failed");
    expect(ok("quality", quality({ agreement_rate: S(0.85) }))).toBe("failed");
    expect(
      ok(
        "co-occurring",
        coOccurring({ patients: D(S(97), "p"), share_of_a: S(0.97) }),
      ),
    ).toBe("failed");
    expect(
      ok(
        "co-occurring",
        coOccurring({ patients: D(S(97), "p"), share_of_a: H }),
      ),
    ).toBe("failed");
  });

  it("a pair shown beside a hidden group of the first condition fails", () => {
    expect(
      ok(
        "co-occurring",
        coOccurring({ a_patients: H, patients: D(S(7), "p"), share_of_a: H }),
      ),
    ).toBe("failed");
  });

  it("a drill on a hidden count fails", () => {
    const v = affected();
    v.by_age[0].patients = D(H, "age-0to17");
    expect(ok("affected", v)).toBe("failed");
    const u = affected();
    u.by_age[0].patients = D(S(0), "age-0to17");
    expect(ok("affected", u)).toBe("failed");
    const w = affected();
    w.by_age[1].patients = D(S(15), "age 18");
    expect(ok("affected", w)).toBe("failed");
  });

  it("a series point that isn't a real day fails", () => {
    for (const start of ["2026-02-30", "2026-7-24", "week 1", "2026-11-01"]) {
      const v = prevalence();
      v.series[0].start = start;
      expect(ok("prevalence", v), start).toBe("failed");
    }
  });

  it("a wrong shape fails", () => {
    expect(ok("prevalence", null)).toBe("failed");
    expect(ok("prevalence", { ...prevalence(), series: "x" })).toBe("failed");
    expect(
      ok("affected", {
        ...affected(),
        by_sex: [{ sex: "x", patients: D(S(0)) }],
      }),
    ).toBe("failed");
    expect(ok("quality", { ...quality(), updated_at: "soon" })).toBe("failed");
    expect(ok("affected", { ...affected(), bucket: "day" })).toBe("failed");
    expect(ok("nope" as ViewId, prevalence())).toBe("failed");
  });

  it("everything hidden still reads, with no drill", () => {
    const hiddenAffected: AffectedOut = {
      ...meta(H),
      by_age: [
        { band: "0-17", patients: D(S(0)) },
        { band: "18-39", patients: D(S(0)) },
        { band: "40-64", patients: D(S(0)) },
        { band: "65-79", patients: D(S(0)) },
        { band: "80+", patients: D(H) },
      ],
      by_sex: [
        { sex: "female", patients: D(H) },
        { sex: "male", patients: D(S(0)) },
        { sex: "other", patients: D(S(0)) },
        { sex: "not_recorded", patients: D(S(0)) },
      ],
      by_setting: [{ setting: "admitted", patients: D(H) }],
      by_location: [
        {
          location: {
            id: "ward7",
            label: "Ward 7 (Paediatrics)",
            setting: "admitted",
          },
          patients: D(H),
        },
      ],
      by_specialty: [{ specialty: "Paediatrics", patients: D(H) }],
    };
    const hiddenPrevalence: PrevalenceOut = {
      ...meta(H),
      total: { cases: H, new: H, existing: S(0) },
      by_condition: [{ condition: E11, cases: D(H), new: H, existing: S(0) }],
      series: [{ start: "2026-07-24", cases: H, new: H }],
    };
    const hiddenPairs: CoOccurringOut = {
      ...meta(H),
      pairs: [{ a: E11, b: I10, a_patients: H, patients: D(H), share_of_a: H }],
    };
    const hiddenFindings: FindingsOut = {
      ...meta(H),
      findings: [
        { name: "Potassium", flag: "high", patients: D(H), results: H },
      ],
      alerts: {
        total: H,
        by_severity: { critical: H, urgent: S(0), info: S(0) },
        median_ack_minutes: H,
        critical_median_ack_minutes: H,
        dismissed: S(0),
        dismiss_reasons: [{ reason: "other", count: S(0) }],
      },
    };
    const hiddenQuality: QualityOut = {
      ...meta(H),
      by_condition: [
        {
          condition: E11,
          consultations: H,
          confidence: { high: H, caution: S(0), review: S(0), failed: S(0) },
          agreement_rate: H,
          rated: H,
          corrections: {
            total: S(0),
            approved: S(0),
            rejected: S(0),
            waiting: S(0),
          },
        },
      ],
    };
    const all = {
      affected: hiddenAffected,
      prevalence: hiddenPrevalence,
      "co-occurring": hiddenPairs,
      findings: hiddenFindings,
      quality: hiddenQuality,
    };
    for (const [v, raw] of Object.entries(all)) {
      const r = readView(v as ViewId, raw);
      expect(r.status, v).toBe("ok");
      expect(JSON.stringify(r)).not.toMatch(/"drill":"/);
    }
  });

  it("a hidden value sent with its number fails", () => {
    const v = prevalence();
    v.series[1].cases = { value: 3, suppressed: true };
    expect(ok("prevalence", v)).toBe("failed");
  });

  it("the mock's replies all read, over a grid of filters", async () => {
    const ages: (AgeBand | null)[] = [
      null,
      "0-17",
      "18-39",
      "40-64",
      "65-79",
      "80+",
    ];
    const sexes: (Sex | null)[] = [
      null,
      "female",
      "male",
      "other",
      "not_recorded",
    ];
    const settings: (Setting | null)[] = [
      null,
      "admitted",
      "outpatient",
      "emergency",
    ];
    let read = 0;
    for (const view of VIEWS)
      for (const age_band of ages)
        for (const sex of sexes)
          for (const setting of settings) {
            const raw = await mock.getView(view, {
              ...F,
              age_band,
              sex,
              setting,
            });
            expect(
              readView(view, raw).status,
              `${view} ${JSON.stringify({ age_band, sex, setting })}`,
            ).toBe("ok");
            read++;
          }
    expect(read).toBe(5 * 6 * 5 * 4);
  }, 60_000);

  it("the mock's replies read for conditions, places, sources and short windows", async () => {
    const windows = [
      { from: "2026-07-24", to: "2026-10-21" },
      { from: "2026-09-01", to: "2026-09-30" },
      { from: "2026-10-01", to: "2026-10-21" },
    ];
    const cases: AnalysisFilters[] = [];
    for (const w of windows)
      for (const condition of [
        null,
        ...FILTER_OPTIONS.conditions.map((c) => c.id),
      ])
        for (const source of [null, ...FILTER_OPTIONS.sources.map((s) => s.id)])
          cases.push({ ...F, ...w, condition, source });
    for (const l of FILTER_OPTIONS.locations)
      cases.push({ ...F, location: l.id });
    for (const specialty of FILTER_OPTIONS.specialties)
      cases.push({ ...F, specialty });
    for (const f of cases)
      for (const view of VIEWS)
        expect(
          readView(view, await mock.getView(view, f)).status,
          `${view} ${JSON.stringify(f)}`,
        ).toBe("ok");
  }, 60_000);
});

describe("readFilterOptions", () => {
  it("reads the sample options", () => {
    const r = readFilterOptions(structuredClone(FILTER_OPTIONS));
    expect(r).toEqual({ status: "ok", data: FILTER_OPTIONS });
  });

  it("fails closed on a wrong shape", () => {
    expect(readFilterOptions(null).status).toBe("failed");
    expect(
      readFilterOptions({
        ...FILTER_OPTIONS,
        sources: [{ id: "a b", label: "x" }],
      }).status,
    ).toBe("failed");
    expect(
      readFilterOptions({ ...FILTER_OPTIONS, conditions: [{ id: "e11" }] })
        .status,
    ).toBe("failed");
  });
});

describe("readPatients", () => {
  const row = {
    pid: "P-7K2Q9",
    age_band: "40-64",
    sex: "female",
    setting: "admitted",
    conditions: [E11],
    findings: [
      { name: "Potassium", flag: "high", source_label: "Results system" },
    ],
  };
  const reply = (
    over: Record<string, unknown> = {},
    rows: unknown[] = [row],
  ) => ({
    level: "deidentified",
    count: 12,
    patients: rows,
    ...over,
  });

  it("reads de-identified rows", () => {
    expect(readPatients(reply(), "deidentified", NOW)).toEqual({
      status: "ok",
      data: reply(),
    });
  });

  it("reads the mock's patients behind a shown count", async () => {
    const v = await mock.getView("affected", F);
    const drill = v.by_age.find((r) => r.patients.drill)!.patients.drill!;
    const raw = await mock.listPatients({
      drill,
      level: "deidentified",
      filters: F,
    });
    expect(readPatients(raw, "deidentified", NOW).status).toBe("ok");
  });

  it("a row with name, mrn, dob, address or an unknown key fails", () => {
    for (const key of ["name", "mrn", "dob", "address", "nickname"])
      expect(
        readPatients(reply({}, [{ ...row, [key]: "x" }]), "deidentified", NOW)
          .status,
        key,
      ).toBe("failed");
    expect(
      readPatients(
        reply({}, [{ ...row, conditions: [{ ...E11, mrn: "1" }] }]),
        "deidentified",
        NOW,
      ).status,
    ).toBe("failed");
    expect(
      readPatients(
        reply({}, [{ ...row, findings: [{ ...row.findings[0], dob: "x" }] }]),
        "deidentified",
        NOW,
      ).status,
    ).toBe("failed");
    expect(
      readPatients(reply({ names: ["x"] }), "deidentified", NOW).status,
    ).toBe("failed");
    const missing: Record<string, unknown> = { ...row };
    delete missing.sex;
    expect(readPatients(reply({}, [missing]), "deidentified", NOW).status).toBe(
      "failed",
    );
  });

  it("level named fails", () => {
    expect(
      readPatients(reply({ level: "named" }), "deidentified", NOW).status,
    ).toBe("failed");
    expect(
      readPatients(reply({ level: undefined }), "deidentified", NOW).status,
    ).toBe("failed");
  });

  it("a pid shaped like an MRN fails", () => {
    for (const pid of ["12345678", "MRN-00123", "P-12", "p-ABCDE", "P-ABCDE "])
      expect(
        readPatients(reply({}, [{ ...row, pid }]), "deidentified", NOW).status,
        pid,
      ).toBe("failed");
  });

  it("201 rows fail", () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...row,
        pid: `P-${String(i).padStart(5, "0")}`,
      }));
    expect(
      readPatients(reply({ count: 300 }, rows(200)), "deidentified", NOW)
        .status,
    ).toBe("ok");
    expect(
      readPatients(reply({ count: 300 }, rows(201)), "deidentified", NOW)
        .status,
    ).toBe("failed");
  });

  it("a count under 5, or under the rows sent, fails", () => {
    expect(readPatients(reply({ count: 3 }), "deidentified", NOW).status).toBe(
      "failed",
    );
    expect(
      readPatients(reply({ count: 0 }, [row]), "deidentified", NOW).status,
    ).toBe("failed");
  });
});

describe("readPatients, named", () => {
  const row = {
    pid: "P-7K2Q9",
    age_band: "40-64",
    sex: "female",
    setting: "admitted",
    conditions: [E11],
    findings: [
      { name: "Potassium", flag: "high", source_label: "Results system" },
    ],
  };
  const named = { ...row, name: "Ifeoma Chukwu", mrn: "HH-104233" };
  const UNTIL = "2026-10-22T10:00:00.000Z";
  const reply = (
    over: Record<string, unknown> = {},
    rows: unknown[] = [named],
  ) => ({
    level: "named",
    count: 12,
    patients: rows,
    named_until: UNTIL,
    clearance: { id: "cl_act", end_date: "2027-03-08" },
    ...over,
  });

  it("a named reply reads with name and mrn", () => {
    expect(readPatients(reply(), "named", NOW)).toEqual({
      status: "ok",
      data: reply(),
    });
  });

  it("a de-identified request answered with names fails closed", () => {
    expect(readPatients(reply(), "deidentified", NOW).status).toBe("failed");
    // Names on a reply that calls itself de-identified fail too.
    expect(
      readPatients(
        { level: "deidentified", count: 12, patients: [named] },
        "deidentified",
        NOW,
      ).status,
    ).toBe("failed");
    // And a de-identified reply to a named request is not what was asked.
    expect(
      readPatients(
        { level: "deidentified", count: 12, patients: [row] },
        "named",
        NOW,
      ).status,
    ).toBe("failed");
  });

  it("a named reply without named_until fails", () => {
    const raw: Record<string, unknown> = reply();
    delete raw.named_until;
    expect(readPatients(raw, "named", NOW).status).toBe("failed");
    for (const named_until of [
      null,
      "",
      "soon",
      1_800_000_000_000,
      // A bare date, or a time with no offset: read in the browser's zone.
      "2026-10-23",
      "2026-10-22T23:00:00",
      "2026-10-22 23:00:00Z",
    ])
      expect(
        readPatients(reply({ named_until }), "named", NOW).status,
        String(named_until),
      ).toBe("failed");
  });

  it("a named reply with named_until in the past fails", () => {
    expect(
      readPatients(
        reply({ named_until: new Date(NOW).toISOString() }),
        "named",
        NOW,
      ).status,
    ).toBe("failed");
    expect(
      readPatients(
        reply({ named_until: "2026-10-22T08:59:59.000Z" }),
        "named",
        NOW,
      ).status,
    ).toBe("failed");
  });

  it("a named reply needs a clearance with an opaque id and a day", () => {
    const raw: Record<string, unknown> = reply();
    delete raw.clearance;
    expect(readPatients(raw, "named", NOW).status).toBe("failed");
    for (const clearance of [
      null,
      { id: "cl act", end_date: "2027-03-08" },
      { id: "cl_act", end_date: "8 Mar 2027" },
      { id: "cl_act", end_date: "2027-03-08", by: "x" },
      { id: "cl_act" },
    ])
      expect(
        readPatients(reply({ clearance }), "named", NOW).status,
        JSON.stringify(clearance),
      ).toBe("failed");
    expect(readPatients(reply({ extra: 1 }), "named", NOW).status).toBe(
      "failed",
    );
  });

  it("a named row with dob or address fails", () => {
    for (const key of ["dob", "address", "phone", "nickname"])
      expect(
        readPatients(reply({}, [{ ...named, [key]: "x" }]), "named", NOW)
          .status,
        key,
      ).toBe("failed");
    // A named row needs both, as words.
    for (const over of [
      { name: "" },
      { name: null },
      { mrn: "" },
      { mrn: 104233 },
    ])
      expect(
        readPatients(reply({}, [{ ...named, ...over }]), "named", NOW).status,
        JSON.stringify(over),
      ).toBe("failed");
    const noMrn: Record<string, unknown> = { ...named };
    delete noMrn.mrn;
    expect(readPatients(reply({}, [noMrn]), "named", NOW).status).toBe(
      "failed",
    );
  });

  it("more than 200 named rows fail", () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...named,
        pid: `P-${String(i).padStart(5, "0")}`,
      }));
    expect(
      readPatients(reply({ count: 300 }, rows(200)), "named", NOW).status,
    ).toBe("ok");
    expect(
      readPatients(reply({ count: 300 }, rows(201)), "named", NOW).status,
    ).toBe("failed");
  });
});

describe("readClearanceMe", () => {
  const me = {
    named: true,
    until: "2027-03-08T22:59:59.999Z",
    clearance_id: "cl_act",
    version: 2,
    reason: null,
  };
  const off = {
    named: false,
    until: null,
    clearance_id: null,
    version: 0,
    reason: "revoked",
  };

  it("reads named and not named", () => {
    expect(readClearanceMe(me)).toEqual(me);
    for (const until of [
      "2027-03-08T22:59:59Z",
      "2027-03-08T23:59:59.999+01:00",
      "2027-03-08T18:59:59-04:00",
    ])
      expect(readClearanceMe({ ...me, until }), until).toEqual({
        ...me,
        until,
      });
    expect(readClearanceMe(off)).toEqual(off);
    for (const reason of [
      "none",
      "ended",
      "removed_from_letter",
      "role_or_account",
      "switched_off",
      null,
    ])
      expect(readClearanceMe({ ...off, reason }), String(reason)).toEqual({
        ...off,
        reason,
      });
  });

  it("is null on a wrong shape", () => {
    for (const raw of [
      null,
      "named",
      {},
      { ...me, named: "true" },
      { ...me, until: null },
      { ...me, until: "soon" },
      { ...me, until: "2026-10-23" },
      { ...me, until: "2026-10-22T23:00:00" },
      { ...off, version: 3 },
      { ...me, clearance_id: "cl act" },
      { ...me, clearance_id: null },
      { ...me, version: -1 },
      { ...me, version: 1.5 },
      { ...me, reason: "revoked" },
      { ...me, extra: 1 },
      { ...off, reason: "because" },
      { ...off, until: "2027-03-08T22:59:59.999Z" },
      { ...off, clearance_id: "cl_act" },
    ])
      expect(readClearanceMe(raw), JSON.stringify(raw)).toBeNull();
  });
});
