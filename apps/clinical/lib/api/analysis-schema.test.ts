import { describe, expect, it } from "vitest";
import { readFilterOptions, readView } from "../analysis/read";
import { emptyFilters } from "../analysis/filters";
import type { PeriodRef, ViewId } from "./analysis-contract";
import {
  DRILLABLE,
  PATIENTS_QUERY,
  PATIENTS_SCHEMA,
  filtersShapeOk,
  patientsShapeOk,
  viewShapeOk,
} from "./analysis-schema";
import { drillKey } from "@/tests/drill";
import { createMockAnalysis } from "./mock-analysis";

const Q2: PeriodRef = { level: "quarter", start: "2026-04-01" };
const VIEWS: ViewId[] = [
  "prevalence",
  "affected",
  "co-occurring",
  "findings",
  "quality",
];
const mock = () =>
  createMockAnalysis({ delayMs: 0, analysisSwitch: () => "on" });
const reply = async (view: ViewId, period = Q2) =>
  structuredClone(
    await mock().getView(view, emptyFilters(period)),
  ) as unknown as Record<string, unknown>;

describe("analysis replies, core 1.17.0, strictly", () => {
  it.each(VIEWS)(
    "the sample %s reads, with its period and history",
    async (v) => {
      const raw = await reply(v);
      expect(viewShapeOk(v, raw)).toBe(true);
      const r = readView(v, raw, Q2);
      expect(r.status).toBe("ok");
      if (r.status !== "ok") return;
      expect(r.data.period).toEqual(Q2);
      expect(r.data.history.map((h) => h.start)).toEqual(["2026-01-01"]);
    },
  );

  it.each(VIEWS)("%s: an extra key anywhere fails the view", async (v) => {
    const raw = await reply(v);
    expect(readView(v, { ...raw, patient_name: "x" }).status).toBe("failed");
    const patients = { ...(raw.patients as object), mrn: "1" };
    expect(readView(v, { ...raw, patients }).status).toBe("failed");
  });

  it("a missing period or history fails", async () => {
    const raw = await reply("prevalence");
    const noPeriod = { ...raw };
    delete noPeriod.period;
    const noHistory = { ...raw };
    delete noHistory.history;
    expect(readView("prevalence", noPeriod).status).toBe("failed");
    expect(readView("prevalence", noHistory).status).toBe("failed");
  });

  it("a reply for another period, or not one period, fails", async () => {
    const raw = await reply("prevalence");
    expect(
      readView("prevalence", raw, { level: "quarter", start: "2026-07-01" })
        .status,
    ).toBe("failed");
    // From and to that aren't exactly the period.
    expect(readView("prevalence", { ...raw, to: "2026-06-29" }).status).toBe(
      "failed",
    );
    // A quarter is drawn by month.
    expect(readView("prevalence", { ...raw, bucket: "week" }).status).toBe(
      "failed",
    );
    // Not a period's first day.
    expect(
      readView("prevalence", {
        ...raw,
        period: { level: "quarter", start: "2026-04-02" },
      }).status,
    ).toBe("failed");
  });

  it("history: earlier periods only, oldest first, at most 7, no 1–4", async () => {
    const raw = await reply("prevalence", {
      level: "month",
      start: "2026-09-01",
    });
    const h = raw.history as { start: string }[];
    expect(h.length).toBe(7);
    expect(readView("prevalence", raw).status).toBe("ok");
    expect(
      readView("prevalence", { ...raw, history: [...h].reverse() }).status,
    ).toBe("failed");
    expect(
      readView("prevalence", { ...raw, history: [...h, h[0]] }).status,
    ).toBe("failed");
    const later = [{ ...h[6], start: "2026-09-01" }];
    expect(readView("prevalence", { ...raw, history: later }).status).toBe(
      "failed",
    );
    const small = [
      {
        start: h[6].start,
        cases: { value: 3, suppressed: false },
        new: { value: 0, suppressed: false },
        patients: { value: 3, suppressed: false },
      },
    ];
    expect(readView("prevalence", { ...raw, history: small }).status).toBe(
      "failed",
    );
  });

  it("drill is null or an opaque key; a share is 0 to 1", async () => {
    const raw = await reply("co-occurring");
    const pairs = raw.pairs as Record<string, unknown>[];
    expect(pairs.length).toBeGreaterThan(0);
    const bad = structuredClone(pairs);
    (bad[0].patients as { drill: unknown }).drill = "a/b";
    expect(readView("co-occurring", { ...raw, pairs: bad }).status).toBe(
      "failed",
    );
    const over = structuredClone(pairs);
    over[0].share_of_a = { value: 1.5, suppressed: false };
    expect(readView("co-occurring", { ...raw, pairs: over }).status).toBe(
      "failed",
    );
  });

  it("the filters: periods per level, oldest first, real first days", async () => {
    const raw = structuredClone(await mock().getFilterOptions()) as Record<
      string,
      unknown
    >;
    expect(filtersShapeOk(raw)).toBe(true);
    expect(readFilterOptions(raw).status).toBe("ok");
    const periods = raw.periods as Record<string, string[]>;
    expect(
      readFilterOptions({
        ...raw,
        periods: { ...periods, month: [...periods.month].reverse() },
      }).status,
    ).toBe("failed");
    expect(
      readFilterOptions({
        ...raw,
        periods: { ...periods, week: ["2026-10-02"] },
      }).status,
    ).toBe("failed");
    expect(readFilterOptions({ ...raw, extra: 1 }).status).toBe("failed");
    // No month frozen yet: no time, empty lists.
    expect(
      readFilterOptions({
        updated_at: null,
        periods: { week: [], month: [], quarter: [] },
        conditions: [],
        locations: [],
        specialties: [],
        sources: [],
      }).status,
    ).toBe("ok");
  });
});

describe("the de-identified list and its query (core 1.19.0)", () => {
  const row = {
    pid: "P-7K2Q9",
    age_band: null,
    sex: "male",
    setting: "emergency",
    conditions: [{ id: "e11", name: null, icd10: null }],
    findings: [{ name: null, flag: null, source_label: null }],
  };
  const list = { level: "deidentified", count: 5, patients: [row] };

  it("reads exactly AnalysisPatients", () => {
    expect(patientsShapeOk(list)).toBe(true);
    expect(patientsShapeOk({ ...list, patients: [] })).toBe(true);
  });

  it("refuses any other key, a source, a count under 5, or more than 200 rows", () => {
    for (const bad of [
      { ...list, extra: 1 },
      { ...list, count: 4 },
      { ...list, count: 5.5 },
      { ...list, level: "named" },
      { ...list, patients: [{ ...row, name: "Jo" }] },
      { ...list, patients: [{ ...row, mrn: "1" }] },
      {
        ...list,
        patients: [
          { ...row, findings: [{ name: null, flag: null, source_label: "x" }] },
        ],
      },
      { ...list, patients: [{ ...row, pid: "P-12" }] },
      { ...list, patients: [{ ...row, sex: null }] },
      { ...list, patients: Array.from({ length: 201 }, () => row) },
    ])
      expect(PATIENTS_SCHEMA.safeParse(bad).success).toBe(false);
  });

  it("a drill key is exactly 43 characters of base64url, never with a pid in it", () => {
    const ok = (drill: unknown) =>
      DRILLABLE.safeParse({ value: 9, suppressed: false, drill }).success;
    expect(ok(drillKey("sex-female"))).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok("sex-female")).toBe(false);
    expect(ok("a".repeat(44))).toBe(false);
    expect(ok(`${"a".repeat(36)}_P-ABCD`)).toBe(false);
    expect(ok(`${"a".repeat(42)}=`)).toBe(false);
  });

  it("the query takes the key, the level, one period and only the row filters", () => {
    const q = {
      drill: drillKey("x"),
      level: "deidentified",
      period: "month",
      start: "2026-09-01",
    };
    expect(PATIENTS_QUERY.safeParse(q).success).toBe(true);
    expect(
      PATIENTS_QUERY.safeParse({ ...q, condition: "e11", setting: "admitted" })
        .success,
    ).toBe(true);
    for (const extra of [
      { location: "w4" },
      { specialty: "cardiology" },
      { source: "main" },
      { from: "2026-09-01" },
      { level: "named" },
      { drill: "short" },
    ])
      expect(PATIENTS_QUERY.safeParse({ ...q, ...extra }).success).toBe(false);
  });

  it("the mock's lists read", async () => {
    const m = mock();
    const f = emptyFilters(Q2);
    const v = await m.getView("affected", f);
    const drill = v.by_sex.find((r) => r.patients.drill)!.patients.drill!;
    expect(
      patientsShapeOk(
        await m.listPatients({ drill, level: "deidentified", filters: f }),
      ),
    ).toBe(true);
  });
});
