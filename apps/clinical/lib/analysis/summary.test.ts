import { describe, expect, it } from "vitest";
import type { GuardedOut } from "../api/admin-contract";
import type {
  AffectedOut,
  CoOccurringOut,
  Drillable,
  FindingsOut,
  Meta,
  PrevalenceOut,
  QualityOut,
  ViewId,
  ViewOut,
} from "../api/analysis-contract";
import { viewSummary } from "./summary";

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const D = (g: GuardedOut, drill: string | null = null): Drillable => ({
  ...g,
  drill,
});
const meta = (patients: GuardedOut): Meta => ({
  updated_at: "2026-10-22T06:00:00.000Z",
  from: "2026-07-24",
  to: "2026-10-22",
  bucket: "week",
  patients,
});
const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };
const I10 = { id: "i10", name: "Hypertension", icd10: "I10" };

const prevalence = (
  patients: GuardedOut,
  over: Partial<PrevalenceOut> = {},
): PrevalenceOut => ({
  ...meta(patients),
  total: { cases: S(1204), new: S(312), existing: S(892) },
  by_condition: Array.from({ length: 9 }, (_, i) => ({
    condition: { id: `c${i}`, name: `C${i}`, icd10: null },
    cases: D(S(100)),
    new: S(20),
    existing: S(80),
  })),
  series: [],
  ...over,
});
const affected = (
  patients: GuardedOut,
  over: Partial<AffectedOut> = {},
): AffectedOut => ({
  ...meta(patients),
  by_age: [
    { band: "0-17", patients: D(S(0)) },
    { band: "18-39", patients: D(S(15)) },
    { band: "40-64", patients: D(S(200)) },
    { band: "65-79", patients: D(S(0)) },
    { band: "80+", patients: D(S(0)) },
  ],
  by_sex: [],
  by_setting: [],
  by_location: [],
  by_specialty: [],
  ...over,
});
const pairs = (
  patients: GuardedOut,
  rows: CoOccurringOut["pairs"],
): CoOccurringOut => ({
  ...meta(patients),
  pairs: rows,
});
const findings = (
  patients: GuardedOut,
  over: Partial<FindingsOut["alerts"]> = {},
): FindingsOut => ({
  ...meta(patients),
  findings: [],
  alerts: {
    total: S(40),
    by_severity: { critical: S(10), urgent: S(20), info: S(10) },
    median_ack_minutes: S(12.5),
    critical_median_ack_minutes: S(6),
    dismissed: S(0),
    dismiss_reasons: [],
    ...over,
  },
});
const quality = (
  patients: GuardedOut,
  over: Partial<QualityOut["by_condition"][number]> = {},
): QualityOut => ({
  ...meta(patients),
  by_condition: [
    {
      condition: E11,
      consultations: S(40),
      confidence: { high: S(20), caution: S(10), review: S(10), failed: S(0) },
      agreement_rate: S(0.75),
      rated: S(20),
      corrections: {
        total: S(0),
        approved: S(0),
        rejected: S(0),
        waiting: S(0),
      },
      ...over,
    },
  ],
});

const FEWER = /fewer than 5(?!\d)/gi;
/** Every number the sentence states, beyond "fewer than 5". */
const numbers = (s: string) =>
  (s.replace(FEWER, "").match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((t) =>
    Number(t.replace(/,/g, "")),
  );

describe("viewSummary", () => {
  it("says what the view shows, from shown values", () => {
    expect(viewSummary("prevalence", prevalence(S(900)))).toBe(
      "1,204 cases across 9 conditions; 312 new in this period.",
    );
    expect(viewSummary("affected", affected(S(215)))).toBe(
      "215 patients; the largest age group is 40–64 (200).",
    );
    expect(
      viewSummary(
        "co-occurring",
        pairs(S(300), [
          {
            a: E11,
            b: I10,
            a_patients: S(100),
            patients: D(S(40)),
            share_of_a: S(0.4),
          },
        ]),
      ),
    ).toBe(
      "1 pair of conditions found together; the most common shown is Type 2 diabetes + Hypertension (40 patients).",
    );
    expect(viewSummary("findings", findings(S(300)))).toBe(
      "40 alerts, 10 critical; median time to acknowledge 12.5 min.",
    );
    expect(viewSummary("quality", quality(S(300)))).toBe(
      "1 condition with consultations; Type 2 diabetes: 40 consultations, clinicians agreed 75% of 20 rated.",
    );
  });

  it("a summary never states a number worked out from a hidden one", () => {
    const cases: [ViewId, ViewOut[ViewId], number[]][] = [
      [
        "prevalence",
        prevalence(S(300), { total: { cases: S(120), new: H, existing: H } }),
        [120, 9],
      ],
      [
        "prevalence",
        prevalence(S(300), {
          total: { cases: S(120), new: S(117), existing: H },
        }),
        [120, 9, 117],
      ],
      [
        "affected",
        affected(S(215), {
          by_age: [
            { band: "0-17", patients: D(H) },
            { band: "18-39", patients: D(H) },
            { band: "40-64", patients: D(S(200)) },
            { band: "65-79", patients: D(S(0)) },
            { band: "80+", patients: D(S(0)) },
          ],
        }),
        [215],
      ],
      [
        "co-occurring",
        pairs(S(300), [
          { a: E11, b: I10, a_patients: S(100), patients: D(H), share_of_a: H },
        ]),
        [1],
      ],
      [
        "findings",
        findings(S(300), {
          total: S(40),
          by_severity: { critical: H, urgent: H, info: S(30) },
          critical_median_ack_minutes: H,
        }),
        [40, 12.5],
      ],
      [
        "quality",
        quality(S(300), { rated: H, agreement_rate: H }),
        [1, 40, 2 /* "Type 2" */],
      ],
    ];
    for (const [view, data, allowed] of cases) {
      const s = viewSummary(view, data);
      expect(s, s).not.toContain("%");
      for (const n of numbers(s)) expect(allowed, `${s}: ${n}`).toContain(n);
    }
  });

  it("all hidden gives 'Fewer than 5 patients match these filters'", () => {
    const all: [ViewId, ViewOut[ViewId]][] = [
      [
        "prevalence",
        prevalence(H, { total: { cases: H, new: H, existing: S(0) } }),
      ],
      ["affected", affected(H)],
      ["co-occurring", pairs(H, [])],
      ["findings", findings(H)],
      ["quality", quality(H)],
    ];
    for (const [view, data] of all)
      expect(viewSummary(view, data)).toBe(
        "Fewer than 5 patients match these filters",
      );
  });

  it("0 gives 'No patients match these filters'", () => {
    expect(viewSummary("prevalence", prevalence(S(0)))).toBe(
      "No patients match these filters",
    );
    expect(viewSummary("quality", { ...meta(S(0)), by_condition: [] })).toBe(
      "No patients match these filters",
    );
  });
});
