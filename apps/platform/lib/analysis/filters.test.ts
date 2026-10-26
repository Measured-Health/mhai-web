import { describe, expect, it } from "vitest";
import type { FilterOptionsOut } from "../api/analysis-contract";
import {
  AGE_BANDS,
  ALLOWED,
  DEFAULT_PERIOD,
  FILTER_LIMIT,
  PERIODS,
  activeCount,
  analysisQueryParams,
  atLimit,
  emptyQuery,
  limitText,
  matchCondition,
  setFilter,
  showSource,
  switchScope,
} from "./filters";

const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };
const J45 = { id: "j45", name: "Asthma", icd10: "J45" };
const UNMAPPED = { id: "unmapped", name: null, icd10: null };

describe("the periods and the empty query", () => {
  it("three periods, Last 12 months by default", () => {
    expect(PERIODS).toEqual(["3m", "6m", "12m"]);
    expect(DEFAULT_PERIOD).toBe("12m");
    expect(emptyQuery("all", null)).toEqual({
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
    });
    expect(emptyQuery("hospital", "h_havana", "3m")).toMatchObject({
      scope: "hospital",
      hospital: "h_havana",
      period: "3m",
    });
  });

  it("one hospital needs a hospital", () => {
    expect(() => emptyQuery("hospital", null)).toThrow();
    expect(() =>
      switchScope(emptyQuery("all", null), "hospital", null),
    ).toThrow();
  });

  it("20-year bands across hospitals, the Plan 6 bands for one", () => {
    expect(AGE_BANDS.all).toEqual(["0-19", "20-39", "40-59", "60-79", "80+"]);
    expect(AGE_BANDS.hospital).toEqual([
      "0-17",
      "18-39",
      "40-64",
      "65-79",
      "80+",
    ]);
  });

  it("across hospitals: never ward or clinic, never source", () => {
    expect(ALLOWED.all).not.toContain("location");
    expect(ALLOWED.all).not.toContain("source");
    expect(ALLOWED.hospital).toEqual(
      expect.arrayContaining(["location", "source"]),
    );
  });
});

describe("the filter limit", () => {
  it("the limit is 3 across hospitals and 4 for one", () => {
    expect(FILTER_LIMIT).toEqual({ all: 3, hospital: 4 });
    let q = emptyQuery("all", null);
    q = setFilter(q, "condition", "e11");
    q = setFilter(q, "sex", "female");
    expect(atLimit(q)).toBe(false);
    q = setFilter(q, "setting", "admitted");
    expect(activeCount(q)).toBe(3);
    expect(atLimit(q)).toBe(true);
    expect(() => setFilter(q, "specialty", "Cardiology")).toThrow();
    // Changing or clearing one at the limit is fine.
    expect(setFilter(q, "sex", "male").sex).toBe("male");
    expect(activeCount(setFilter(q, "sex", null))).toBe(2);

    let h = emptyQuery("hospital", "h_havana");
    h = setFilter(h, "location", "ward4");
    h = setFilter(h, "source", "results_system");
    h = setFilter(h, "age_band", "18-39");
    expect(atLimit(h)).toBe(false);
    h = setFilter(h, "sex", "female");
    expect(atLimit(h)).toBe(true);
    expect(() => setFilter(h, "condition", "e11")).toThrow();
  });

  it("says the limit in plain words", () => {
    expect(limitText("all")).toBe(
      "Up to 3 filters at a time across all hospitals. Remove one to add another.",
    );
    expect(limitText("hospital")).toBe(
      "Up to 4 filters at a time for one hospital. Remove one to add another.",
    );
  });

  it("setFilter refuses location across hospitals", () => {
    const q = emptyQuery("all", null);
    expect(() => setFilter(q, "location", "ward4")).toThrow();
    expect(() => setFilter(q, "source", "results_system")).toThrow();
  });

  it("setFilter refuses another scope's age band", () => {
    expect(() =>
      setFilter(emptyQuery("all", null), "age_band", "18-39"),
    ).toThrow();
    expect(() =>
      setFilter(emptyQuery("hospital", "h_havana"), "age_band", "20-39"),
    ).toThrow();
    expect(setFilter(emptyQuery("all", null), "age_band", "80+").age_band).toBe(
      "80+",
    );
  });
});

describe("switching scope (Review Focus 1)", () => {
  it("switching One hospital (ward, source, 18–39, female) to All hospitals clears every filter and says so", () => {
    let q = emptyQuery("hospital", "h_havana", "6m");
    q = setFilter(q, "location", "ward4");
    q = setFilter(q, "source", "results_system");
    q = setFilter(q, "age_band", "18-39");
    q = setFilter(q, "sex", "female");
    const { query, cleared } = switchScope(q, "all", null);
    expect(cleared).toBe(true);
    expect(query).toEqual(emptyQuery("all", null, "6m"));
    expect(activeCount(query)).toBe(0);
    // Nothing of the old scope goes out with the next request.
    const params = analysisQueryParams(query);
    expect(params).toBe("scope=all&period=6m");
    for (const word of [
      "ward4",
      "results_system",
      "18-39",
      "female",
      "h_havana",
    ])
      expect(params).not.toContain(word);
  });

  it("All hospitals to One hospital clears too, keeping the period", () => {
    const q = setFilter(emptyQuery("all", null, "3m"), "sex", "male");
    const { query, cleared } = switchScope(q, "hospital", "h_northgate");
    expect(cleared).toBe(true);
    expect(query).toEqual(emptyQuery("hospital", "h_northgate", "3m"));
  });

  it("another hospital clears; nothing to clear says nothing", () => {
    const q = setFilter(
      emptyQuery("hospital", "h_havana"),
      "location",
      "ward4",
    );
    expect(switchScope(q, "hospital", "h_northgate")).toEqual({
      query: emptyQuery("hospital", "h_northgate"),
      cleared: true,
    });
    expect(
      switchScope(emptyQuery("all", null), "hospital", "h_havana"),
    ).toEqual({ query: emptyQuery("hospital", "h_havana"), cleared: false });
  });
});

describe("conditions, sources and the query string", () => {
  it("E11 and 'diab' find Type 2 diabetes", () => {
    expect(matchCondition(E11, "E11")).toBe(true);
    expect(matchCondition(E11, "e11")).toBe(true);
    expect(matchCondition(E11, "diab")).toBe(true);
    expect(matchCondition(E11, "  Diab ")).toBe(true);
    expect(matchCondition(J45, "diab")).toBe(false);
    expect(matchCondition(E11, "")).toBe(true);
    expect(matchCondition(UNMAPPED, "not stand")).toBe(true);
  });

  it("source shows only with two or more", () => {
    const o = (n: number): FilterOptionsOut => ({
      updated_at: "2026-10-23T09:30:00.000Z",
      conditions: [],
      specialties: [],
      locations: [],
      sources: [
        { id: "main_record", label: "Main record" },
        { id: "results_system", label: "Results system" },
      ].slice(0, n),
    });
    expect(showSource(o(0))).toBe(false);
    expect(showSource(o(1))).toBe(false);
    expect(showSource(o(2))).toBe(true);
  });

  it("query params drop nulls", () => {
    const q = setFilter(
      setFilter(emptyQuery("hospital", "h_havana"), "sex", "female"),
      "specialty",
      "General medicine",
    );
    expect(analysisQueryParams(q)).toBe(
      "scope=hospital&hospital=h_havana&period=12m&sex=female&specialty=General+medicine",
    );
  });
});
