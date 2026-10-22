import { SMALL_GROUP_MIN } from "@mhai/ui/small-groups";
import { beforeEach, describe, expect, it } from "vitest";
import type { GuardedOut } from "./admin-contract";
import type {
  AgeBand,
  AnalysisFilters,
  Drillable,
  Setting,
  Sex,
  ViewId,
  ViewOut,
} from "./analysis-contract";
import { buildCohort, COHORT, FILTER_OPTIONS } from "./analysis-fixtures";
import { ApiError } from "./errors";
import { createMockAnalysis } from "./mock-analysis";
import { auditEvents, resetAudit } from "./mock-audit";

const VENDORS = [
  "epic",
  "cerner",
  "oracle",
  "openmrs",
  "meditech",
  "athena",
  "allscripts",
  "nextgen",
  "eclinicalworks",
  "dhis",
  "bahmni",
];
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
const mock = (o: Parameters<typeof createMockAnalysis>[0] = {}) =>
  createMockAnalysis({ delayMs: 0, ...o });
const small = (n: number | null) => n !== null && n > 0 && n < SMALL_GROUP_MIN;

beforeEach(resetAudit);

describe("sample cohort", () => {
  it("is the same every time", () => {
    expect(buildCohort()).toEqual(buildCohort());
    expect(COHORT.length).toBeGreaterThan(550);
    expect(COHORT.length).toBeLessThan(650);
    const pids = COHORT.map((p) => p.pid);
    expect(new Set(pids).size).toBe(pids.length);
    for (const p of pids) expect(p).toMatch(/^P-[0-9A-Z]{5}$/);
  });

  it("has two sources, labelled 'Main record' and 'Results system'", () => {
    expect(FILTER_OPTIONS.sources.map((s) => s.label)).toEqual([
      "Main record",
      "Results system",
    ]);
    const labels = new Set(
      COHORT.flatMap((p) => p.findings.map((x) => x.source_label)),
    );
    expect(labels).toEqual(new Set(["Main record", "Results system"]));
  });

  it("names no vendor anywhere in the fixtures", () => {
    const text = JSON.stringify({ COHORT, FILTER_OPTIONS }).toLowerCase();
    for (const v of VENDORS) expect(text).not.toContain(v);
    expect(text).not.toMatch(/\blab\b/);
  });

  it("gives no patient row a name, MRN, date of birth or address", async () => {
    const { patients } = await mock().listPatients({
      drill: "sex-female",
      level: "deidentified",
      filters: F,
    });
    expect(patients.length).toBeGreaterThan(0);
    for (const row of patients) {
      expect(Object.keys(row).sort()).toEqual([
        "age_band",
        "conditions",
        "findings",
        "pid",
        "setting",
        "sex",
      ]);
    }
    const text = JSON.stringify(patients);
    expect(text).not.toMatch(/mrn|birth|dob|address|phone|email/i);
  });
});

describe("sample analysis", () => {
  it("hides counts of 1 to 4 and shows 0", async () => {
    const a = await mock().getView("affected", { ...F, condition: "a15" });
    expect(a.patients).toEqual({ value: null, suppressed: true });
    const b = await mock().getView("affected", { ...F, age_band: "0-17" });
    const adult = b.by_age.find((x) => x.band === "40-64")!;
    expect(adult.patients).toEqual({
      value: 0,
      suppressed: false,
      drill: null,
    });
  });

  it("reads Tuberculosis as hidden", async () => {
    const v = await mock().getView("prevalence", F);
    const tb = v.by_condition.find((c) => c.condition.id === "a15")!;
    expect(tb.condition.name).toBe("Tuberculosis");
    expect(tb.cases).toEqual({ value: null, suppressed: true, drill: null });
    expect(tb.new.suppressed).toBe(true);
  });

  it("counts Not standardised, not dropped", async () => {
    const v = await mock().getView("prevalence", F);
    const ns = v.by_condition.find((c) => c.condition.name === null)!;
    expect(ns.condition.icd10).toBeNull();
    expect(ns.cases.value).toBe(12);
    expect(ns.cases.drill).toBe("cond-unmapped");
  });

  it("puts a drill only on shown counts of 5 or more", async () => {
    const m = mock();
    for (const f of [F, { ...F, sex: "female" as Sex }]) {
      for (const d of allDrillables(await views(m, f))) {
        if (d.drill === null) continue;
        expect(d.suppressed).toBe(false);
        expect(d.value).toBeGreaterThanOrEqual(SMALL_GROUP_MIN);
        expect(d.drill).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    }
  });

  it("caps patients at 200 and logs one audit event", async () => {
    const m = mock();
    const out = await m.listPatients({
      drill: "sex-female",
      level: "deidentified",
      filters: F,
    });
    expect(out.patients).toHaveLength(200);
    expect(out.count).toBeGreaterThan(200);
    const ev = auditEvents();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "analysis_patients_viewed",
      count: 200,
    });
  });

  it("refuses a hidden or unknown drill with 422 too_small", async () => {
    for (const drill of ["cond-a15", "nonsense", "cond-zzz"]) {
      const e = await mock()
        .listPatients({ drill, level: "deidentified", filters: F })
        .catch((x) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ status: 422, code: "too_small" });
    }
    expect(auditEvents()).toHaveLength(0);
  });

  it("fails only the view it is told to fail", async () => {
    const m = mock({ analysis: { failView: "quality" } });
    await expect(m.getView("quality", F)).rejects.toMatchObject({
      status: 503,
    });
    await expect(m.getView("prevalence", F)).resolves.toBeDefined();
    await expect(m.getFilterOptions()).resolves.toBeDefined();
  });

  it("fails every call when unavailable", async () => {
    const m = mock({ analysis: "unavailable" });
    await expect(m.getFilterOptions()).rejects.toMatchObject({ status: 503 });
    await expect(m.getView("affected", F)).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      m.listPatients({
        drill: "sex-female",
        level: "deidentified",
        filters: F,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

// --- secondary suppression: nothing hidden can be worked out ---

async function views(m: ReturnType<typeof mock>, f: AnalysisFilters) {
  const out = {} as { [V in ViewId]: ViewOut[V] };
  for (const v of VIEWS)
    (out as Record<string, unknown>)[v] = await m.getView(v, f);
  return out;
}

function allDrillables(v: { [V in ViewId]: ViewOut[V] }): Drillable[] {
  return [
    ...v.prevalence.by_condition.map((r) => r.cases),
    ...v.affected.by_age.map((r) => r.patients),
    ...v.affected.by_sex.map((r) => r.patients),
    ...v.affected.by_setting.map((r) => r.patients),
    ...v.affected.by_location.map((r) => r.patients),
    ...v.affected.by_specialty.map((r) => r.patients),
    ...v["co-occurring"].pairs.map((r) => r.patients),
    ...v.findings.findings.map((r) => r.patients),
  ];
}

/** A set that adds up to a total: no hidden member may be worked out. */
function checkSet(label: string, members: GuardedOut[], total: GuardedOut) {
  for (const g of [...members, total]) {
    expect(small(g.value), `${label}: a 1-4 value is shown`).toBe(false);
    if (g.suppressed) expect(g.value).toBeNull();
  }
  if (total.suppressed) return;
  const hidden = members.filter((m) => m.suppressed).length;
  const shown = members.reduce((s, m) => s + (m.value ?? 0), 0);
  const rest = (total.value ?? 0) - shown;
  if (hidden === 0) {
    expect(rest, `${label}: members do not add up`).toBe(0);
  } else {
    expect(
      hidden,
      `${label}: one hidden member is derivable`,
    ).toBeGreaterThanOrEqual(2);
    expect(rest, `${label}: hidden sum reads as 1-4`).toBeGreaterThanOrEqual(
      SMALL_GROUP_MIN,
    );
  }
}

function checkShare(
  label: string,
  num: number | null,
  den: GuardedOut,
  share: GuardedOut,
) {
  if (share.suppressed || share.value === null) return;
  expect(den.suppressed, `${label}: share over a hidden count`).toBe(false);
  const n = Math.round(share.value * (den.value ?? 0));
  expect(small(n), `${label}: numerator ${n}`).toBe(false);
  expect(small((den.value ?? 0) - n), `${label}: complement`).toBe(false);
  void num;
}

function checkViews(v: { [V in ViewId]: ViewOut[V] }, label: string) {
  const p = v.prevalence;
  const a = v.affected;
  checkSet(`${label} total`, [p.total.new, p.total.existing], p.total.cases);
  for (const r of p.by_condition)
    checkSet(`${label} ${r.condition.id}`, [r.new, r.existing], r.cases);
  for (const [k, rows] of Object.entries({
    age: a.by_age,
    sex: a.by_sex,
    setting: a.by_setting,
    location: a.by_location,
    specialty: a.by_specialty,
  }))
    checkSet(
      `${label} by_${k}`,
      rows.map((r) => r.patients),
      a.patients,
    );
  for (const r of v["co-occurring"].pairs)
    checkShare(`${label} pair`, r.patients.value, r.a_patients, r.share_of_a);
  for (const d of allDrillables(v)) {
    if (d.drill !== null) {
      expect(d.suppressed).toBe(false);
      expect(d.value).toBeGreaterThanOrEqual(SMALL_GROUP_MIN);
    }
  }
  const al = v.findings.alerts;
  checkSet(
    `${label} severities`,
    [al.by_severity.critical, al.by_severity.urgent, al.by_severity.info],
    al.total,
  );
  checkSet(
    `${label} dismiss`,
    al.dismiss_reasons.map((r) => r.count),
    al.dismissed,
  );
  for (const m of [al.median_ack_minutes, al.critical_median_ack_minutes])
    expect(small(m.value)).toBe(false);
  if (al.total.suppressed) {
    expect(
      al.median_ack_minutes.suppressed || al.median_ack_minutes.value === null,
    ).toBe(true);
  }
  if (al.by_severity.critical.suppressed)
    expect(al.critical_median_ack_minutes.value).toBeNull();
  for (const r of v.quality.by_condition) {
    const id = `${label} quality ${r.condition.id}`;
    checkSet(`${id} confidence`, Object.values(r.confidence), r.consultations);
    checkSet(
      `${id} corrections`,
      [r.corrections.approved, r.corrections.rejected, r.corrections.waiting],
      r.corrections.total,
    );
    checkShare(`${id} agreement`, null, r.rated, r.agreement_rate);
  }
}

describe("secondary suppression", () => {
  it("never lets a hidden member be worked out, for any filter combination", async () => {
    const m = mock();
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
    let hiddenSeen = 0;
    for (const age_band of ages)
      for (const sex of sexes)
        for (const setting of settings) {
          const f = { ...F, age_band, sex, setting };
          const v = await views(m, f);
          checkViews(v, JSON.stringify({ age_band, sex, setting }));
          hiddenSeen += v.affected.by_location.filter(
            (r) => r.patients.suppressed,
          ).length;
        }
    expect(hiddenSeen).toBeGreaterThan(0);
  });

  it("holds for conditions, locations, specialties, sources and shorter windows", async () => {
    const m = mock();
    const windows = [
      { from: "2026-07-01", to: "2026-10-21" },
      { from: "2026-09-01", to: "2026-09-30" },
    ];
    for (const w of windows)
      for (const condition of [
        null,
        ...FILTER_OPTIONS.conditions.map((c) => c.id),
      ])
        for (const source of [null, "main_record", "results_system"])
          checkViews(
            await views(m, { ...F, ...w, condition, source }),
            `${condition} ${source}`,
          );
    for (const loc of FILTER_OPTIONS.locations)
      checkViews(await views(m, { ...F, location: loc.id }), loc.id);
    for (const specialty of FILTER_OPTIONS.specialties)
      checkViews(await views(m, { ...F, specialty }), specialty);
  });

  it("hides the other half of a pair when one new/existing count is hidden", async () => {
    // A window so short that most rows have a few of each.
    const v = await mock().getView("prevalence", {
      ...F,
      from: "2026-10-01",
      to: "2026-10-21",
    });
    checkSet("short", [v.total.new, v.total.existing], v.total.cases);
  });
});
