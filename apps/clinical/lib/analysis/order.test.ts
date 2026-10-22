import { describe, expect, it } from "vitest";
import type { GuardedOut } from "../api/admin-contract";
import type {
  AffectedOut,
  ConditionRef,
  Drillable,
  Meta,
  PrevalenceOut,
} from "../api/analysis-contract";
import { analysisCsv } from "./csv";
import { defaultFilters } from "./filters";
import { conditionName } from "./labels";
import { orderRows, orderView } from "./order";

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const D = (g: GuardedOut): Drillable => ({ ...g, drill: null });
const meta = (patients: GuardedOut): Meta => ({
  updated_at: "2026-10-22T06:00:00.000Z",
  from: "2026-07-24",
  to: "2026-10-22",
  bucket: "week",
  patients,
});
const C = (id: string, name: string | null, icd10: string | null = null) =>
  ({ id, name, icd10 }) satisfies ConditionRef;
const E11 = C("e11", "Type 2 diabetes", "E11");
const I10 = C("i10", "Hypertension", "I10");
const J45 = C("j45", "Asthma", "J45");
const A15 = C("a15", "Tuberculosis", "A15");
const J18 = C("j18_9", "Pneumonia", "J18.9");
const UNMAPPED = C("unmapped", null);

const row = (condition: ConditionRef, cases: GuardedOut) => ({
  condition,
  cases: D(cases),
  new: cases.suppressed ? H : S(0),
  existing: cases,
});
const prevalence = (
  rows: PrevalenceOut["by_condition"],
  patients = S(300),
): PrevalenceOut => ({
  ...meta(patients),
  total: { cases: S(200), new: S(0), existing: S(200) },
  by_condition: rows,
  series: [],
});
const names = (d: PrevalenceOut) =>
  d.by_condition.map((r) => conditionName(r.condition));

/** Every order of a list (small lists only). */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
  );
}

describe("orderRows", () => {
  it("hidden rows come after the shown ones, by name, whatever the server's order", () => {
    const rows = [
      row(E11, S(60)),
      row(A15, H),
      row(UNMAPPED, H),
      row(J45, H),
      row(I10, S(80)),
      row(J18, H),
    ];
    for (const p of permutations(rows))
      expect(names(orderView("prevalence", prevalence(p)))).toEqual([
        "Hypertension",
        "Type 2 diabetes",
        "Asthma",
        "Pneumonia",
        "Tuberculosis",
        "Not standardised",
      ]);
  });

  it("with every row hidden, every row sorts by name, not standardised and not recorded last", () => {
    const hidden = prevalence(
      [row(A15, H), row(UNMAPPED, H), row(E11, H), row(J45, H), row(I10, H)],
      H,
    );
    expect(names(orderView("prevalence", hidden))).toEqual([
      "Asthma",
      "Hypertension",
      "Tuberculosis",
      "Type 2 diabetes",
      "Not standardised",
    ]);

    const ward = (id: string, label: string) => ({
      id,
      label,
      setting: "admitted" as const,
    });
    const affected: AffectedOut = {
      ...meta(H),
      by_age: [
        { band: "80+", patients: D(H) },
        { band: "0-17", patients: D(H) },
      ],
      by_sex: [],
      by_setting: [],
      by_location: [
        { location: null, patients: D(H) },
        { location: ward("ward7", "Ward 7 (Paediatrics)"), patients: D(H) },
        { location: ward("ed", "Emergency"), patients: D(H) },
        { location: ward("ward4", "Ward 4 (Medical)"), patients: D(H) },
      ],
      by_specialty: [
        { specialty: "Paediatrics", patients: D(H) },
        { specialty: null, patients: D(H) },
        { specialty: "Cardiology", patients: D(H) },
      ],
    };
    const out = orderView("affected", affected);
    expect(out.by_location.map((r) => r.location?.label ?? null)).toEqual([
      "Emergency",
      "Ward 4 (Medical)",
      "Ward 7 (Paediatrics)",
      null,
    ]);
    expect(out.by_specialty.map((r) => r.specialty)).toEqual([
      "Cardiology",
      "Paediatrics",
      null,
    ]);
    // Age bands always sort by their fixed order.
    expect(out.by_age.map((r) => r.band)).toEqual(["0-17", "80+"]);
  });

  it("age band, sex and location type use their fixed order, whatever order the server sends", () => {
    // Sent by size, as a careless server might: shown largest first, then
    // the hidden groups from largest to smallest.
    const affected: AffectedOut = {
      ...meta(S(300)),
      by_age: [
        { band: "40-64", patients: D(S(120)) },
        { band: "18-39", patients: D(S(90)) },
        { band: "65-79", patients: D(H) },
        { band: "80+", patients: D(H) },
        { band: "0-17", patients: D(S(86)) },
      ],
      by_sex: [
        { sex: "male", patients: D(S(160)) },
        { sex: "female", patients: D(S(137)) },
        { sex: "not_recorded", patients: D(H) },
        { sex: "other", patients: D(H) },
      ],
      by_setting: [
        { setting: null, patients: D(S(150)) },
        { setting: "emergency", patients: D(H) },
        { setting: "outpatient", patients: D(S(100)) },
        { setting: "admitted", patients: D(S(46)) },
      ],
      by_location: [],
      by_specialty: [],
    };
    const fixed = (d: AffectedOut) => ({
      age: d.by_age.map((r) => r.band),
      sex: d.by_sex.map((r) => r.sex),
      setting: d.by_setting.map((r) => r.setting),
    });
    const want = {
      age: ["0-17", "18-39", "40-64", "65-79", "80+"],
      sex: ["female", "male", "other", "not_recorded"],
      setting: ["admitted", "outpatient", "emergency", null],
    };
    expect(fixed(orderView("affected", affected))).toEqual(want);
    for (const ages of permutations(affected.by_age))
      expect(
        fixed(orderView("affected", { ...affected, by_age: ages })).age,
      ).toEqual(want.age);
    expect(fixed(affected).age[0]).toBe("40-64");

    // The CSV writes the same fixed order.
    const csv = analysisCsv("affected", affected, {
      hospital: "Havana Hospital",
      filters: defaultFilters("2026-10-22"),
      options: null,
    });
    const order = (labels: string[]) =>
      labels.map((l) => csv.indexOf(`\r\n${l},`));
    for (const labels of [
      ["0–17", "18–39", "40–64", "65–79", "80 and over"],
      ["Female", "Male", "Other", "Not recorded"],
      ["Admitted", "Outpatient", "Emergency"],
    ]) {
      const at = order(labels);
      expect(at.every((i) => i > 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    }
  });

  it("sorts shown rows by value, largest first, and leaves the input alone", () => {
    const xs = [
      { k: "b", v: S(5) },
      { k: "a", v: S(9) },
      { k: "c", v: H },
    ];
    const out = orderRows(
      xs,
      (r) => r.v,
      (r) => ({ name: r.k, last: false }),
    );
    expect(out.map((r) => r.k)).toEqual(["a", "b", "c"]);
    expect(xs.map((r) => r.k)).toEqual(["b", "a", "c"]);
  });

  it("the CSV writes hidden rows in the same order", () => {
    const d = prevalence([row(A15, H), row(UNMAPPED, H), row(J45, H)]);
    const csv = analysisCsv("prevalence", d, {
      hospital: "Havana Hospital",
      filters: defaultFilters("2026-10-22"),
      options: null,
    });
    const at = (s: string) => csv.indexOf(`\r\n${s},`);
    expect(at("Asthma · J45")).toBeGreaterThan(0);
    expect(at("Asthma · J45")).toBeLessThan(at("Tuberculosis · A15"));
    expect(at("Tuberculosis · A15")).toBeLessThan(at("Not standardised"));
  });
});
