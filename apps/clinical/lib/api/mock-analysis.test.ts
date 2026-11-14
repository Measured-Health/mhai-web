import { readFileSync } from "node:fs";
import path from "node:path";
import { SMALL_GROUP_MIN } from "@mhai/ui/small-groups";
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_NOW, mockAdminAs } from "@/tests/admin";
import { DEMO_EMAILS, MOCK_CODE, createStepUp } from "@/lib/auth/mock";
import { readPatients } from "../analysis/read";
import type { AdminClient } from "./admin";
import type { GuardedOut } from "./admin-contract";
import type {
  AgeBand,
  AnalysisFilters,
  Drillable,
  Setting,
  Sex,
  NamedPatientsIn,
  ViewId,
  ViewOut,
} from "./analysis-contract";
import { buildCohort, COHORT, FILTER_OPTIONS } from "./analysis-fixtures";
import { ApiError } from "./errors";
import { VENDOR_NAMES } from "../../../../scripts/vendor-names.mjs";
import { PLATFORM_ADMINS } from "./clearances-fixtures";
import {
  COLD_CONTEXTS_MAX,
  COLD_PERIOD,
  LISTS_PER_DAY,
  LISTS_PER_MINUTE,
  PATIENTS_PER_QUARTER,
  createMockAnalysis,
  mockDrillKey,
  share,
} from "./mock-analysis";
import { auditEvents, resetAudit } from "./mock-audit";
import {
  createMockClearances,
  endOfHospitalDay,
  resetClearances,
} from "./mock-clearances";

const F: AnalysisFilters = {
  period: { level: "quarter", start: "2026-04-01" },
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
/** The key of one row (its token), as the views would send it under `f`. */
const KEY = (token: string, view: ViewId = "affected", f = F) =>
  mockDrillKey(f, view, token)!;
const mock = (o: Parameters<typeof createMockAnalysis>[0] = {}) =>
  createMockAnalysis({ delayMs: 0, ...o });
const hideG: GuardedOut = { value: null, suppressed: true };
const small = (n: number | null) => n !== null && n > 0 && n < SMALL_GROUP_MIN;

beforeEach(resetAudit);

describe("sample cohort", () => {
  it("is the same every time", () => {
    expect(buildCohort()).toEqual(buildCohort());
    expect(COHORT.length).toBe(2400);
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
    for (const v of VENDOR_NAMES) expect(text).not.toContain(v);
    expect(text).not.toMatch(/\blab\b/);
  });

  it("gives no patient row a name, MRN, date of birth or address", async () => {
    const { patients } = await mock().listPatients({
      drill: KEY("sex-female"),
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
    const a = await mock().getView("affected", {
      ...F,
      location: "ward4",
      sex: "other",
    });
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
    expect(ns.cases.value).toBe(19);
    // Prevalence counts cases, not patients: never a list (core 1.19.0).
    expect(ns.cases.drill).toBeNull();
  });

  it("puts a drill only on shown counts of 5 or more", async () => {
    for (const f of [F, { ...F, sex: "female" as Sex }]) {
      for (const d of allDrillables(await views(f))) {
        if (d.drill === null) continue;
        expect(d.suppressed).toBe(false);
        expect(d.value).toBeGreaterThanOrEqual(SMALL_GROUP_MIN);
        expect(d.drill).toMatch(/^[A-Za-z0-9_-]{43}$/);
      }
    }
  });

  it("caps patients at 200 and logs one audit event", async () => {
    const m = mock();
    const out = await m.listPatients({
      drill: KEY("sex-female"),
      level: "deidentified",
      filters: F,
    });
    expect(out.patients).toHaveLength(200);
    expect(out.count).toBeGreaterThan(200);
    const ev = auditEvents();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "analysis_patients_viewed",
      type: "security",
      flag: null,
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

  it("refuses anything but one listed period, as core does", async () => {
    const m = mock();
    for (const period of [
      { level: "month", start: "2026-09-02" },
      { level: "month", start: "2026-10-01" },
      { level: "week", start: "2026-10-22" },
      { level: "quarter", start: "2020-01-01" },
      { level: "year", start: "2026-01-01" },
    ] as AnalysisFilters["period"][])
      await expect(
        m.getView("affected", { ...F, period }),
      ).rejects.toMatchObject({ status: 422, code: "invalid_range" });
    await expect(
      m.getFilterOptions({ level: "month", start: "2026-09-02" }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_range" });
    await expect(m.getView("nope" as ViewId, F)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a third filter, a place with a setting, and an unlisted condition", async () => {
    const m = mock();
    await expect(
      m.getView("affected", {
        ...F,
        sex: "female",
        age_band: "80+",
        setting: "admitted",
      }),
    ).rejects.toMatchObject({ status: 422, code: "too_many_filters" });
    await expect(
      m.getView("affected", { ...F, location: "ward4", setting: "admitted" }),
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
    await expect(
      m.getView("affected", { ...F, condition: "nope" }),
    ).rejects.toMatchObject({ status: 422, code: "validation_failed" });
  });

  it("is 404 for everything while the hospital's switch is off", async () => {
    const m = mock({ analysisSwitch: () => "off" });
    await expect(m.getFilterOptions()).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
    await expect(m.getView("prevalence", F)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("the cold period is not_ready the first time, then reads", async () => {
    const m = mock();
    const f = { ...F, period: COLD_PERIOD };
    await expect(m.getView("prevalence", f)).rejects.toMatchObject({
      status: 503,
      code: "not_ready",
    });
    await expect(m.getView("prevalence", f)).resolves.toBeDefined();
  });

  it("past the cap on new filter sets in a period, a new one is 429", async () => {
    const m = mock();
    const opened: AnalysisFilters[] = [];
    const ages: AgeBand[] = ["0-17", "18-39", "40-64", "65-79", "80+"];
    const sexes: Sex[] = ["female", "male", "other", "not_recorded"];
    for (const condition of [null, ...(await listed(F.period))])
      for (const age_band of [null, ...ages])
        opened.push({ ...F, condition, age_band });
    for (const sex of sexes)
      for (const specialty of FILTER_OPTIONS.specialties)
        opened.push({ ...F, sex, specialty });
    for (const location of FILTER_OPTIONS.locations)
      for (const age_band of ages)
        opened.push({ ...F, location: location.id, age_band });
    expect(opened.length).toBeGreaterThan(COLD_CONTEXTS_MAX);
    for (const f of opened.slice(0, COLD_CONTEXTS_MAX))
      await m.getView("affected", f);
    // One already opened still reads; a new one doesn't.
    await expect(m.getView("quality", opened[0]!)).resolves.toBeDefined();
    await expect(
      m.getView("affected", opened[COLD_CONTEXTS_MAX]!),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("lists the periods, and each period's own conditions", async () => {
    const o = await mock().getFilterOptions();
    expect(o.periods.month.at(-1)).toBe("2026-09-01");
    expect(o.periods.quarter).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
    ]);
    expect(o.periods.week[0]).toBe("2025-10-22");
    expect(o.periods.week.at(-1)).toBe("2026-10-15");
    expect(o.conditions.some((c) => c.name === null)).toBe(true);
    const week = await mock().getFilterOptions({
      level: "week",
      start: "2026-10-15",
    });
    expect(week.conditions.length).toBeLessThanOrEqual(o.conditions.length);
  });

  it("sends up to 7 earlier periods, oldest first, each on its own", async () => {
    const v = await mock().getView("prevalence", {
      ...F,
      period: { level: "month", start: "2026-09-01" },
    });
    expect(v.history.map((h) => h.start)).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
    const first = await mock().getView("prevalence", {
      ...F,
      period: { level: "month", start: "2025-11-01" },
    });
    expect(first.history).toEqual([]);
  });

  it("hides a median over a hidden count, even with nothing acknowledged", async () => {
    const v = await mock().getView("findings", {
      ...F,
      specialty: "Emergency medicine",
    });
    if (v.alerts.by_severity.critical.suppressed)
      expect(v.alerts.critical_median_ack_minutes.suppressed).toBe(true);
  });

  it("fails every call when unavailable", async () => {
    const m = mock({ analysis: "unavailable" });
    await expect(m.getFilterOptions()).rejects.toMatchObject({ status: 503 });
    await expect(m.getView("affected", F)).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      m.listPatients({
        drill: KEY("sex-female"),
        level: "deidentified",
        filters: F,
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
});

// --- secondary suppression: nothing hidden can be worked out ---

/**
 * Every view for `f`, from a fresh sample (so the sweeps below don't reach
 * the per-period cap on new filter sets).
 */
async function views(f: AnalysisFilters) {
  const m = mock();
  const out = {} as { [V in ViewId]: ViewOut[V] };
  for (const v of VIEWS)
    (out as Record<string, unknown>)[v] = await m.getView(v, f);
  return out;
}

/** The conditions a period lists (5 or more patients there, and Not standardised). */
const listed = async (period: AnalysisFilters["period"]) =>
  (await mock().getFilterOptions(period)).conditions.map((c) => c.id);

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

const NOT_COUNTS = new Set([
  "share_of_a",
  "agreement_rate",
  "median_ack_minutes",
  "critical_median_ack_minutes",
]);
const isGuarded = (x: unknown): x is GuardedOut =>
  typeof x === "object" &&
  x !== null &&
  "value" in x &&
  "suppressed" in x &&
  typeof (x as GuardedOut).suppressed === "boolean";

/** Every GuardedOut in a reply: hidden is null, shown counts are whole and never 1-4, drills only on shown 5+. */
function walk(x: unknown, path: string, key = "") {
  if (Array.isArray(x))
    return x.forEach((v, i) => walk(v, `${path}[${i}]`, key));
  if (typeof x !== "object" || x === null) return;
  if (isGuarded(x)) {
    if (x.suppressed) expect(x.value, `${path}: hidden has a value`).toBeNull();
    if (x.value !== null && !NOT_COUNTS.has(key)) {
      expect(Number.isInteger(x.value), `${path}: not whole`).toBe(true);
      expect(x.value, `${path}: negative`).toBeGreaterThanOrEqual(0);
      expect(small(x.value), `${path}: ${x.value} is shown`).toBe(false);
    }
    if (x.value !== null && key === "share_of_a")
      expect(x.value >= 0 && x.value <= 1, `${path}: share range`).toBe(true);
    const drill = (x as Drillable).drill;
    if (typeof drill === "string") {
      expect(x.suppressed, `${path}: drill on hidden`).toBe(false);
      expect(x.value, `${path}: drill under 5`).toBeGreaterThanOrEqual(
        SMALL_GROUP_MIN,
      );
      expect(drill).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    return;
  }
  for (const [k, v] of Object.entries(x)) walk(v, `${path}.${k}`, k);
}

/** A part of a total whose rest isn't sent: [part, total − part] is a set. */
function checkPart(label: string, part: GuardedOut, total: GuardedOut) {
  if (total.suppressed) {
    expect((part.value ?? 0) > 0, `${label}: part under a hidden total`).toBe(
      false,
    );
    return;
  }
  if (part.suppressed) return;
  const rest = (total.value ?? 0) - (part.value ?? 0);
  expect(rest, `${label}: part over total`).toBeGreaterThanOrEqual(0);
  expect(small(rest), `${label}: rest ${rest} is derivable`).toBe(false);
}

function checkSeriesDays(v: ViewOut["prevalence"], label: string) {
  for (const s of v.series) {
    // New is part of cases; the rest (existing that week) is a hidden member.
    const id = `${label} week ${s.start}`;
    if (s.cases.suppressed)
      expect((s.new.value ?? 0) > 0, `${id}: new under hidden cases`).toBe(
        false,
      );
    else if (!s.new.suppressed) {
      const rest = (s.cases.value ?? 0) - (s.new.value ?? 0);
      expect(rest, `${id}: new over cases`).toBeGreaterThanOrEqual(0);
      expect(small(rest), `${id}: existing ${rest} is derivable`).toBe(false);
    }
    expect(s.start, label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${s.start}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
      s.start,
    );
    expect(s.start >= v.from && s.start <= v.to, label).toBe(true);
  }
}

/** A pair: neither the shown count, its complement, nor the share may read 1-4. */
function checkPair(label: string, r: ViewOut["co-occurring"]["pairs"][number]) {
  const { a_patients: a, patients: p, share_of_a: sh } = r;
  if (p.suppressed || a.suppressed) {
    expect(sh.suppressed, `${label}: share over a hidden count`).toBe(true);
    expect(p.drill).toBeNull();
    return;
  }
  const rest = (a.value ?? 0) - (p.value ?? 0);
  expect(rest, `${label}: complement`).toBeGreaterThanOrEqual(0);
  expect(small(rest), `${label}: complement ${rest} is derivable`).toBe(false);
  if (!sh.suppressed)
    expect(sh.value).toBe(
      Math.round(((p.value ?? 0) / (a.value ?? 1)) * 100) / 100,
    );
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
    checkPair(`${label} ${r.a.id}/${r.b.id}`, r);
  for (const [name, reply] of Object.entries(v))
    walk(reply, `${label} ${name}`);
  checkSeriesDays(p, label);
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
  checkPart(`${label} dismissed of alerts`, al.dismissed, al.total);
  checkSet(
    `${label} dismiss`,
    al.dismiss_reasons.map((r) => r.count),
    al.dismissed,
  );
  if (al.total.suppressed)
    expect(al.median_ack_minutes.suppressed, `${label} median`).toBe(true);
  if (al.by_severity.critical.suppressed)
    expect(
      al.critical_median_ack_minutes.suppressed,
      `${label} critical median`,
    ).toBe(true);
  for (const r of v.quality.by_condition) {
    const id = `${label} quality ${r.condition.id}`;
    checkSet(`${id} confidence`, Object.values(r.confidence), r.consultations);
    checkSet(
      `${id} corrections`,
      [r.corrections.approved, r.corrections.rejected, r.corrections.waiting],
      r.corrections.total,
    );
    checkPart(`${id} rated of consultations`, r.rated, r.consultations);
    if (r.rated.suppressed)
      expect(r.agreement_rate.suppressed, `${id} rate`).toBe(true);
  }
}

describe("secondary suppression", () => {
  it("never lets a hidden member be worked out, for any filter combination", async () => {
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
    // Every pair of two filters (core takes at most two).
    const pairs = [
      ...ages.flatMap((age_band) => sexes.map((sex) => ({ age_band, sex }))),
      ...ages.flatMap((age_band) =>
        settings.map((setting) => ({ age_band, setting })),
      ),
      ...sexes.flatMap((sex) => settings.map((setting) => ({ sex, setting }))),
    ];
    for (const pair of pairs) {
      const f = { ...F, ...pair };
      const v = await views(f);
      checkViews(v, JSON.stringify(pair));
      hiddenSeen += v.affected.by_location.filter(
        (r) => r.patients.suppressed,
      ).length;
    }
    expect(hiddenSeen).toBeGreaterThan(0);
  });

  it("holds for conditions, locations, specialties, sources and shorter periods", async () => {
    const periods: AnalysisFilters["period"][] = [
      { level: "quarter", start: "2026-07-01" },
      { level: "month", start: "2026-09-01" },
      { level: "week", start: "2026-10-15" },
    ];
    for (const period of periods)
      for (const condition of [null, ...(await listed(period))])
        for (const source of [null, "main_record", "results_system"])
          checkViews(
            await views({ ...F, period, condition, source }),
            `${period.start} ${condition} ${source}`,
          );
    for (const loc of FILTER_OPTIONS.locations)
      checkViews(await views({ ...F, location: loc.id }), loc.id);
    for (const specialty of FILTER_OPTIONS.specialties)
      checkViews(await views({ ...F, specialty }), specialty);
  });

  it("holds across condition, location and specialty crossed with age and sex", async () => {
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
    const conds = [null, ...(await listed(F.period))];
    const locs = [null, ...FILTER_OPTIONS.locations.map((l) => l.id)];
    const specs = [null, ...FILTER_OPTIONS.specialties];
    // Each of condition, location and specialty with an age band or a sex
    // (two filters, the most core takes).
    const firsts = [
      ...conds.map((condition) => ({ condition })),
      ...locs.map((location) => ({ location })),
      ...specs.map((specialty) => ({ specialty })),
    ];
    for (const first of firsts) {
      for (const age_band of ages)
        checkViews(
          await views({ ...F, ...first, age_band }),
          JSON.stringify({ ...first, age_band }),
        );
      for (const sex of sexes)
        checkViews(
          await views({ ...F, ...first, sex }),
          JSON.stringify({ ...first, sex }),
        );
    }
  }, 60_000);

  it("never reads a share's numerator or complement as 1 to 4", () => {
    for (let den = 5; den <= 300; den++) {
      const d = { value: den, suppressed: false };
      for (let num = 0; num <= den; num++) {
        const s = share(num, d, den);
        const bad = small(num) || small(den - num);
        expect(s.suppressed, `${num}/${den}`).toBe(bad);
      }
    }
    expect(share(3, hideG, 3).suppressed).toBe(true);
  });

  it("hides the other half of a pair when one new/existing count is hidden", async () => {
    // A period so short that most rows have a few of each.
    const v = await mock().getView("prevalence", {
      ...F,
      period: { level: "week", start: "2026-10-15" },
    });
    checkSet("short", [v.total.new, v.total.existing], v.total.cases);
  });
});

describe("row order", () => {
  /** Shown rows, then hidden rows by name with the unnamed last: never by size. */
  function hiddenByName<R>(
    rows: R[],
    g: (r: R) => GuardedOut,
    name: (r: R) => string | null,
    where: string,
  ) {
    const first = rows.findIndex((r) => g(r).suppressed);
    if (first < 0) return 0;
    const hidden = rows.slice(first);
    expect(
      hidden.every((r) => g(r).suppressed),
      `${where}: a shown row after a hidden one`,
    ).toBe(true);
    const key = (r: R) => [name(r) === null ? 1 : 0, name(r) ?? ""] as const;
    for (let i = 1; i < hidden.length; i++) {
      const [al, an] = key(hidden[i - 1]!);
      const [bl, bn] = key(hidden[i]!);
      expect(
        al < bl || (al === bl && an.localeCompare(bn, "en-GB") <= 0),
        `${where}: ${an} before ${bn}`,
      ).toBe(true);
    }
    return hidden.length;
  }

  it("sends hidden rows after the shown ones, by name, for every list", async () => {
    let seen = 0;
    const ages: (AgeBand | null)[] = [null, "0-17", "65-79", "80+"];
    const sexes: (Sex | null)[] = [null, "female", "other", "not_recorded"];
    // Every pair of two (core takes at most two filters).
    const sets = [
      ...ages.flatMap((age_band) => sexes.map((sex) => ({ age_band, sex }))),
      ...ages.flatMap((age_band) =>
        [null, "ward4", "ward7"].map((location) => ({ age_band, location })),
      ),
      ...sexes.flatMap((sex) =>
        [null, "ward4", "ward7"].map((location) => ({ sex, location })),
      ),
    ];
    for (const set of sets) {
      const f = { ...F, ...set };
      const v = await views(f);
      const at = JSON.stringify(set);
      seen += hiddenByName(
        v.prevalence.by_condition,
        (r) => r.cases,
        (r) => r.condition.name,
        `prevalence ${at}`,
      );
      seen += hiddenByName(
        v.affected.by_location,
        (r) => r.patients,
        (r) => r.location?.label ?? null,
        `locations ${at}`,
      );
      seen += hiddenByName(
        v.affected.by_specialty,
        (r) => r.patients,
        (r) => r.specialty,
        `specialties ${at}`,
      );
      seen += hiddenByName(
        v["co-occurring"].pairs,
        (r) => r.patients,
        (r) => `${r.a.name} + ${r.b.name}`,
        `pairs ${at}`,
      );
      seen += hiddenByName(
        v.findings.findings,
        (r) => r.patients,
        (r) => r.name,
        `findings ${at}`,
      );
      seen += hiddenByName(
        v.quality.by_condition,
        (r) => r.consultations,
        (r) => r.condition.name,
        `quality ${at}`,
      );
    }
    expect(seen).toBeGreaterThan(20);
  });
});

// --- named patients (Plan 11c) ---

describe("named patients", () => {
  let clock = ADMIN_NOW;
  let admin: AdminClient;
  beforeEach(() => {
    resetClearances();
    resetAudit();
    clock = ADMIN_NOW;
    admin = mockAdminAs(DEMO_EMAILS.hospitalAdmin);
  });
  const as = (
    email: string,
    namedAccess: "off" | "letters_only" | "on" = "on",
  ) =>
    createMockAnalysis({
      delayMs: 0,
      now: () => clock,
      me: async () => email,
      staff: () => admin.listStaff(),
      namedAccess,
    });
  const named = (
    email: string,
    over: Record<string, unknown> = {},
    namedAccess: "off" | "letters_only" | "on" = "on",
  ) =>
    as(email, namedAccess).listNamedPatients(
      {
        drill: KEY("sex-female"),
        filters: F,
        purpose: "clinical_follow_up",
        ...over,
      } as NamedPatientsIn,
      { idempotencyKey: `k-${keyN++}` },
    );
  let keyN = 0;
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      if (e instanceof ApiError) return `${e.status} ${e.code}`;
      throw e;
    }
    return "ok";
  };
  const GRACE = DEMO_EMAILS.hospitalAdmin;
  const KEMI = DEMO_EMAILS.analyst;
  const HOUR = 3_600_000;

  it("Grace Nwosu gets named rows with a purpose", async () => {
    const out = await named(GRACE);
    if (out.level !== "named") throw new Error("not named");
    expect(out.patients).toHaveLength(200);
    expect(out.count).toBeGreaterThan(200);
    for (const row of out.patients) {
      expect(Object.keys(row).sort()).toEqual([
        "age_band",
        "conditions",
        "findings",
        "mrn",
        "name",
        "pid",
        "setting",
        "sex",
      ]);
      expect(row.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(row.mrn).toMatch(/^HH-\d{6}$/);
    }
    // The letter ends months away, so an hour from now is sooner.
    expect(out.named_until).toBe(new Date(clock + HOUR).toISOString());
    expect(out.clearance.id).toBe("cl_act");
    const letter = await createMockClearances({
      now: () => clock,
      me: async () => GRACE,
      delayMs: 0,
      staff: () => admin.listStaff(),
    }).getClearance("cl_act");
    expect(out.clearance.end_date).toBe(letter.end_date);
    expect(readPatients(out, "named", clock).status).toBe("ok");
    // The de-identified list of the same people still has no names.
    const plain = await as(GRACE).listPatients({
      drill: KEY("sex-female"),
      level: "deidentified",
      filters: F,
    });
    for (const row of plain.patients) {
      expect(row).not.toHaveProperty("name");
      expect(row).not.toHaveProperty("mrn");
    }
    expect(JSON.stringify(plain)).not.toMatch(/"mrn"|HH-/);
  });

  it("named_until is the end of the letter's day when that is sooner", async () => {
    const letter = await createMockClearances({
      now: () => clock,
      me: async () => GRACE,
      delayMs: 0,
      staff: () => admin.listStaff(),
    }).getClearance("cl_soon");
    const end = endOfHospitalDay(letter.end_date);
    clock = Date.parse(end) - 20 * 60_000;
    const out = await named(KEMI);
    if (out.level !== "named") throw new Error("not named");
    expect(out.named_until).toBe(end);
    expect(out.clearance).toEqual({ id: "cl_soon", end_date: letter.end_date });
  });

  it("a clinician without a letter is 403 not_cleared", async () => {
    expect(await code(named(DEMO_EMAILS.clinician))).toBe("403 not_cleared");
    // Dr. Obi is a hospital admin with only a waiting letter.
    expect(await code(named(DEMO_EMAILS.director))).toBe("403 not_cleared");
    expect(await as(DEMO_EMAILS.director).getClearanceMe()).toEqual({
      named: false,
      until: null,
      clearance_id: null,
      version: 0,
      reason: "none",
    });
    expect(auditEvents()).toHaveLength(0);
  });

  it("me reads the cover live", async () => {
    const me = await as(GRACE).getClearanceMe();
    expect(me).toMatchObject({
      named: true,
      clearance_id: "cl_act",
      reason: null,
    });
    expect(Number.isInteger(me.version)).toBe(true);
    expect(Date.parse(me.until!)).toBeGreaterThan(clock);
  });

  it("after cl_act is revoked, Grace gets 403 not_cleared and me says named false, revoked", async () => {
    const m = as(GRACE);
    const before = await m.getClearanceMe();
    expect(before.named).toBe(true);
    await createMockClearances({
      now: () => clock,
      me: async () => GRACE,
      delayMs: 0,
      stepUp: createStepUp(() => clock),
      staff: () => admin.listStaff(),
    }).revokeClearance(
      "cl_act",
      { reason: "no_longer_needed", mfaCode: MOCK_CODE },
      { idempotencyKey: "k-revoke" },
    );
    expect(await code(named(GRACE))).toBe("403 not_cleared");
    expect(await m.getClearanceMe()).toEqual({
      named: false,
      until: null,
      clearance_id: null,
      version: 0,
      reason: "revoked",
    });
  });

  it("after Analyst is removed, Kemi gets 403", async () => {
    expect(await code(named(KEMI))).toBe("ok");
    const kemi = (await admin.listStaff()).find((s) => s.id === "s-kemi")!;
    await admin.updateStaff("s-kemi", {
      version: kemi.version,
      roles: ["clinician"],
    });
    expect(await code(named(KEMI))).toBe("403 not_cleared");
    expect(await as(KEMI).getClearanceMe()).toMatchObject({
      named: false,
      reason: "role_or_account",
    });
  });

  it("after the letter's end date, it is 403 clearance_ended", async () => {
    const letter = await createMockClearances({
      now: () => clock,
      me: async () => GRACE,
      delayMs: 0,
      staff: () => admin.listStaff(),
    }).getClearance("cl_soon");
    clock = Date.parse(endOfHospitalDay(letter.end_date)) + HOUR;
    expect(await code(named(KEMI))).toBe("403 clearance_ended");
    expect(await as(KEMI).getClearanceMe()).toMatchObject({
      named: false,
      reason: "ended",
    });
  });

  it("with the switch off it is 403 named_access_off", async () => {
    for (const position of ["off", "letters_only"] as const) {
      expect(await code(named(GRACE, {}, position)), position).toBe(
        "403 named_access_off",
      );
      expect(await as(GRACE, position).getClearanceMe()).toMatchObject({
        named: false,
        reason: "switched_off",
      });
      expect(await as(GRACE, position).getNamedAccess()).toMatchObject({
        position,
      });
    }
    expect(auditEvents()).toHaveLength(0);
  });

  it("Other without a note is 422", async () => {
    expect(await code(named(GRACE, { purpose: "other" }))).toBe("422 invalid");
    expect(await code(named(GRACE, { purpose: "other", note: "  " }))).toBe(
      "422 invalid",
    );
    expect(await code(named(GRACE, { purpose: undefined }))).toBe(
      "422 invalid",
    );
    expect(await code(named(GRACE, { purpose: "curiosity" }))).toBe(
      "422 invalid",
    );
    expect(
      await code(named(GRACE, { purpose: "audit", note: "x".repeat(201) })),
    ).toBe("422 invalid");
    expect(auditEvents()).toHaveLength(0);
    expect(
      await code(named(GRACE, { purpose: "other", note: "Ward round list" })),
    ).toBe("ok");
    expect(
      await code(named(GRACE, { purpose: "audit", note: "x".repeat(200) })),
    ).toBe("ok");
  });

  it("each named view records one flagged event with the count and purpose and no name", async () => {
    const out = await named(GRACE, { purpose: "quality_improvement" });
    if (out.level !== "named") throw new Error("not named");
    const ev = auditEvents();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      kind: "analysis_named_viewed",
      type: "security",
      flag: "alert",
      count: 200,
      purpose: "quality_improvement",
      actor: { display_name: "Grace Nwosu" },
      target: null,
    });
    const text = JSON.stringify(ev);
    for (const row of out.patients) {
      expect(text).not.toContain(row.name);
      expect(text).not.toContain(row.mrn);
      expect(text).not.toContain(row.pid);
    }
    await named(GRACE, { purpose: "audit" });
    expect(auditEvents()).toHaveLength(2);
    // The free-text note is never recorded.
    await named(GRACE, { purpose: "other", note: "Ward 4 recall" });
    expect(auditEvents()).toHaveLength(3);
    expect(auditEvents()[2]).toMatchObject({ purpose: "other" });
    const all = JSON.stringify(auditEvents());
    expect(all).not.toContain("Ward 4 recall");
    expect(all).not.toContain("note");
  });

  it("names are never a GET: level named there is 422 level_not_supported", async () => {
    const e = await as(GRACE)
      .listPatients({
        drill: KEY("sex-female"),
        // Only a de-identified level type-checks; a caller that forces one is refused.
        level: "named" as unknown as "deidentified",
        filters: F,
      })
      .catch((x) => x);
    expect(e).toMatchObject({ status: 422, code: "level_not_supported" });
    expect(auditEvents()).toHaveLength(0);
  });

  it("a retry with the same Idempotency-Key is one view, still checked afresh", async () => {
    const m = as(GRACE);
    const q: NamedPatientsIn = {
      drill: KEY("sex-female"),
      filters: F,
      purpose: "audit",
    };
    const key = { idempotencyKey: "k-same" };
    const a = await m.listNamedPatients(q, key);
    const b = await m.listNamedPatients(q, key);
    expect(b.patients).toEqual(a.patients);
    expect(auditEvents()).toHaveLength(1);
    await m.listNamedPatients(q, { idempotencyKey: "k-other" });
    expect(auditEvents()).toHaveLength(2);
    // The same key after the cover is gone is refused, not replayed.
    await createMockClearances({
      now: () => clock,
      me: async () => GRACE,
      delayMs: 0,
      stepUp: createStepUp(() => clock),
      staff: () => admin.listStaff(),
    }).revokeClearance(
      "cl_act",
      { reason: "no_longer_needed", mfaCode: MOCK_CODE },
      { idempotencyKey: "k-revoke" },
    );
    expect(await code(m.listNamedPatients(q, key))).toBe("403 not_cleared");
  });

  it("a key is bound to the person and the request, and keeps its named_until", async () => {
    const m = as(GRACE);
    const q: NamedPatientsIn = {
      drill: KEY("sex-female"),
      filters: F,
      purpose: "audit",
    };
    const key = { idempotencyKey: "k-bound" };
    const first = await m.listNamedPatients(q, key);
    expect(auditEvents()).toHaveLength(1);
    // Another request under the same key: refused, and nothing recorded.
    for (const other of [
      { ...q, drill: KEY("sex-male") },
      { ...q, purpose: "clinical_follow_up" as const },
      { ...q, filters: { ...F, sex: "female" as const } },
      { ...q, purpose: "other" as const, note: "Ward 4 recall" },
    ])
      expect(
        await code(m.listNamedPatients(other, key)),
        JSON.stringify(other),
      ).toBe("422 idempotency_mismatch");
    // Another person under the same key, on the same client: refused.
    const kemi = createMockAnalysis({
      delayMs: 0,
      now: () => clock,
      me: async () => KEMI,
      staff: () => admin.listStaff(),
    });
    expect(await code(kemi.listNamedPatients(q, key))).toBe("ok");
    const shared = { idempotencyKey: "k-shared" };
    let who: string = GRACE;
    const either = createMockAnalysis({
      delayMs: 0,
      now: () => clock,
      me: async () => who,
      staff: () => admin.listStaff(),
    });
    await either.listNamedPatients(q, shared);
    who = KEMI;
    expect(await code(either.listNamedPatients(q, shared))).toBe(
      "422 idempotency_mismatch",
    );
    expect(auditEvents()).toHaveLength(3);
    // A replay later keeps the original named_until, and records nothing.
    clock += 30 * 60_000;
    const replay = await m.listNamedPatients(q, key);
    expect(replay.named_until).toBe(first.named_until);
    expect(auditEvents()).toHaveLength(3);
    // Once named_until has passed, the key is spent: never renewed.
    clock = Date.parse(first.named_until);
    expect(await code(m.listNamedPatients(q, key))).toBe("409 expired");
    clock += HOUR;
    expect(await code(m.listNamedPatients(q, key))).toBe("409 expired");
    expect(auditEvents()).toHaveLength(3);
  });

  it("no invented name matches a real-person list", async () => {
    const readme = readFileSync(
      path.join(import.meta.dirname, "../../../../README.md"),
      "utf8",
    );
    // The demo's own people: the README's samples, every staff member in the
    // fixtures, and the platform admins.
    const readmeSamples = [
      "Dr. Reyes",
      "Dr. Okafor",
      "Nurse Bello",
      "Grace Nwosu",
      "Dr. Ngozi Obi",
      "Chike Okoro",
      "Dr. Kemi Adeyemi",
      "Amara Eze",
      "Chidi Nwosu",
    ];
    for (const p of readmeSamples) expect(readme).toContain(p);
    const staff = await admin.listStaff();
    expect(staff.length).toBeGreaterThan(10);
    const people = [
      ...readmeSamples,
      ...staff.flatMap((s) => [s.display_name, s.full_name]),
      ...Object.values(PLATFORM_ADMINS).map((p) => p.display_name),
    ];
    const words = new Set(
      people
        .flatMap((p) => p.replace(/^(Dr|Nurse)\. /, "").split(/[ -]/))
        .map((w) => w.toLowerCase()),
    );
    const names = COHORT.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of new Set(names)) {
      expect(readme, name).not.toContain(name);
      for (const w of name.toLowerCase().split(" "))
        expect(words.has(w), `${name}: ${w}`).toBe(false);
      for (const v of VENDOR_NAMES) expect(name.toLowerCase()).not.toContain(v);
    }
    const mrns = COHORT.map((p) => p.mrn);
    expect(new Set(mrns).size).toBe(mrns.length);
    for (const m of mrns) expect(m).toMatch(/^HH-\d{6}$/);
  });
});

/** Whether any count in a reply carries a drill key. */
const anyDrill = (v: unknown) => /"drill":"/.test(JSON.stringify(v));

describe("the drill-down, as core 1.19.0 enforces it", () => {
  const listOf = (m: ReturnType<typeof mock>, drill: string, f = F) =>
    m.listPatients({ drill, level: "deidentified", filters: f });
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: ApiError) => [e.status, e.code],
    );

  it("keys only on age band, sex and setting rows, pairs and findings", async () => {
    const m = mock();
    const a = await m.getView("affected", F);
    expect(a.by_sex.some((r) => r.patients.drill)).toBe(true);
    expect(a.by_age.some((r) => r.patients.drill)).toBe(true);
    for (const r of [...a.by_location, ...a.by_specialty])
      expect(r.patients.drill).toBeNull();
    for (const r of (await m.getView("prevalence", F)).by_condition)
      expect(r.cases.drill).toBeNull();
    expect(
      (await m.getView("co-occurring", F)).pairs.some((r) => r.patients.drill),
    ).toBe(true);
    expect(
      (await m.getView("findings", F)).findings.some((r) => r.patients.drill),
    ).toBe(true);
  });

  it("no key at all under a location, specialty or source filter; keys under the row filters", async () => {
    const opts = await mock().getFilterOptions(F.period);
    for (const f of [
      { ...F, location: opts.locations[0]!.id },
      { ...F, specialty: opts.specialties[0]! },
      { ...F, source: opts.sources[0]!.id },
    ])
      for (const v of ["affected", "co-occurring", "findings"] as const)
        expect(anyDrill(await mock().getView(v, f))).toBe(false);
    const sexF = { ...F, sex: "female" as Sex };
    expect(anyDrill(await mock().getView("affected", sexF))).toBe(true);
  });

  it("a key opens only under its own period and filters: elsewhere 422 too_small", async () => {
    const m = mock();
    const key = KEY("sex-female");
    expect((await listOf(m, key)).count).toBeGreaterThan(0);
    const other = [
      { ...F, sex: "female" as Sex },
      { ...F, period: { level: "month" as const, start: "2026-05-01" } },
    ];
    for (const f of other)
      expect(await refusal(listOf(m, key, f))).toEqual([422, "too_small"]);
    // The location row's token never had a key.
    expect(await refusal(listOf(m, KEY("loc-ward4")))).toEqual([
      422,
      "too_small",
    ]);
  });

  it("the list's count is the shown cell; rows carry no source", async () => {
    const m = mock();
    const a = await m.getView("affected", F);
    const row = a.by_sex.find((r) => r.patients.drill)!;
    const out = await listOf(m, row.patients.drill!);
    expect(out.count).toBe(row.patients.value);
    for (const p of out.patients)
      for (const x of p.findings) expect(x.source_label).toBeNull();
  });

  it("pids are random per period: the same patients differ between two periods", async () => {
    const q = {
      ...F,
      period: { level: "quarter" as const, start: "2026-04-01" },
    };
    const m1 = {
      ...F,
      period: { level: "month" as const, start: "2026-05-01" },
    };
    const a = await listOf(mock(), KEY("sex-female", "affected", q), q);
    const b = await listOf(mock(), KEY("sex-female", "affected", m1), m1);
    const shared = a.patients.filter((p) =>
      b.patients.some((x) => x.pid === p.pid),
    );
    expect(shared).toHaveLength(0);
    // Stable within one period.
    const again = await listOf(mock(), KEY("sex-female", "affected", q), q);
    expect(again.patients.map((p) => p.pid)).toEqual(
      a.patients.map((p) => p.pid),
    );
  });

  it(`${LISTS_PER_MINUTE} lists a minute: the next is 429 rate_limited and records nothing`, async () => {
    let t = Date.parse("2026-10-22T09:00:00Z");
    const m = mock({ now: () => t, me: async () => "ana@demo.example" });
    // A small group, so the quarter's patients don't run out first.
    const f = { ...F, age_band: "0-17" as AgeBand };
    const v = await m.getView("affected", f);
    const drill = v.by_setting.find((r) => r.patients.drill)!.patients.drill!;
    for (let i = 0; i < LISTS_PER_MINUTE; i++) await listOf(m, drill, f);
    expect(await refusal(listOf(m, drill, f))).toEqual([429, "rate_limited"]);
    expect(auditEvents()).toHaveLength(LISTS_PER_MINUTE);
    t += 61_000;
    await listOf(m, drill, f);
    expect(auditEvents()).toHaveLength(LISTS_PER_MINUTE + 1);
  });

  it(`${LISTS_PER_DAY} lists a day`, async () => {
    let t = Date.parse("2026-10-22T08:00:00Z");
    const m = mock({ now: () => t, me: async () => "ana@demo.example" });
    const f = { ...F, age_band: "0-17" as AgeBand };
    const v = await m.getView("affected", f);
    const drill = v.by_setting.find((r) => r.patients.drill)!.patients.drill!;
    for (let i = 0; i < LISTS_PER_DAY; i++) {
      await listOf(m, drill, f);
      t += 7_000;
    }
    expect(await refusal(listOf(m, drill, f))).toEqual([429, "rate_limited"]);
    t = Date.parse("2026-10-23T08:00:00Z");
    expect((await listOf(m, drill, f)).count).toBeGreaterThan(0);
  });

  it(`${PATIENTS_PER_QUARTER} different patients a quarter, per person`, async () => {
    const m = mock({ me: async () => "ana@demo.example" });
    // Two lists of 200 different patients: the second would pass 300.
    await listOf(m, KEY("sex-female"));
    expect(await refusal(listOf(m, KEY("sex-male")))).toEqual([
      429,
      "rate_limited",
    ]);
    // The same patients again cost nothing new.
    expect((await listOf(m, KEY("sex-female"))).patients).toHaveLength(200);
    // Someone else has their own.
    const other = mock({ me: async () => "ben@demo.example" });
    expect((await listOf(other, KEY("sex-male"))).patients).toHaveLength(200);
  });
});
