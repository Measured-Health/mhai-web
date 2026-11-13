import { describe, expect, it } from "vitest";
import { readFilterOptions, readView } from "../analysis/read";
import { emptyFilters } from "../analysis/filters";
import type { PeriodRef, ViewId } from "./analysis-contract";
import { filtersShapeOk, viewShapeOk } from "./analysis-schema";
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
