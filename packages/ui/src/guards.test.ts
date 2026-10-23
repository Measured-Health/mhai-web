import { describe, expect, it } from "vitest";
import {
  guardedOk,
  hasOnlyKeys,
  isCount,
  isHiddenValue,
  isId,
  isNum,
  isObj,
  isTime,
  numeratorLeaks,
  remainderLeaks,
  scrub,
  setGivesAway,
  shows,
  type GuardedValue,
} from "./guards";

const g = (value: number | null): GuardedValue => ({
  value,
  suppressed: false,
});
const H: GuardedValue = { value: null, suppressed: true };

describe("shapes", () => {
  it("reads objects, numbers, counts, times and ids", () => {
    expect(isObj({})).toBe(true);
    expect(isObj([])).toBe(false);
    expect(isObj(null)).toBe(false);
    expect(isNum(1.5)).toBe(true);
    expect(isNum(Number.NaN)).toBe(false);
    expect(isCount(0)).toBe(true);
    expect(isCount(2.5)).toBe(false);
    expect(isCount(-1)).toBe(false);
    expect(isTime("2026-10-01T00:00:00Z")).toBe(true);
    expect(isTime("2026-13-45")).toBe(false);
    expect(isTime("yesterday")).toBe(false);
    expect(isId("a_B-9")).toBe(true);
    expect(isId("a b")).toBe(false);
    expect(isId("")).toBe(false);
    expect(isId(3)).toBe(false);
  });
  it("shows and isHiddenValue", () => {
    expect(shows(g(7))).toBe(true);
    expect(shows(g(null))).toBe(false);
    expect(shows(H)).toBe(false);
    expect(isHiddenValue(H)).toBe(true);
    expect(isHiddenValue(g(null))).toBe(false);
  });
});

describe("guardedOk", () => {
  it("a shown 1-4 count is not ok; 0 is", () => {
    for (const n of [1, 2, 3, 4]) expect(guardedOk(g(n), "count")).toBe(false);
    expect(guardedOk(g(0), "count")).toBe(true);
    expect(guardedOk(g(5), "count")).toBe(true);
    expect(guardedOk(g(-1), "count")).toBe(false);
    expect(guardedOk(g(Number.NaN), "count")).toBe(false);
  });
  it("loose allows null only: a count stays whole", () => {
    expect(guardedOk(g(125.5), "count", true)).toBe(false);
    expect(guardedOk(g(null), "count", true)).toBe(true);
  });
  it("a share is 0-1", () => {
    expect(guardedOk(g(0), "share")).toBe(true);
    expect(guardedOk(g(1), "share")).toBe(true);
    expect(guardedOk(g(1.01), "share")).toBe(false);
    expect(guardedOk(g(-0.1), "share")).toBe(false);
  });
  it("rates and hours are 0 or more; minutes are whole or a half", () => {
    for (const k of ["rate", "hours"] as const) {
      expect(guardedOk(g(12.3), k)).toBe(true);
      expect(guardedOk(g(-1), k)).toBe(false);
    }
    expect(guardedOk(g(12.5), "minutes")).toBe(true);
    expect(guardedOk(g(12.3), "minutes")).toBe(false);
    expect(guardedOk(g(-1), "minutes")).toBe(false);
  });
  it("null reads only where loose; hidden reads only without a number", () => {
    expect(guardedOk(g(null), "share")).toBe(false);
    expect(guardedOk(g(null), "share", true)).toBe(true);
    expect(guardedOk(H, "count")).toBe(true);
  });
  it("a hidden value that carries a number is unreadable", () => {
    for (const k of ["count", "share", "minutes"] as const)
      expect(guardedOk({ value: 3, suppressed: true }, k, true)).toBe(false);
    expect(guardedOk({ value: 0, suppressed: true }, "count")).toBe(false);
  });
  it("refuses a wrong shape", () => {
    expect(guardedOk(null, "count")).toBe(false);
    expect(guardedOk({ value: 6 }, "count")).toBe(false);
    expect(guardedOk({ value: "6", suppressed: false }, "count")).toBe(false);
    expect(guardedOk({ value: 6, suppressed: "no" }, "count")).toBe(false);
  });
});

describe("numeratorLeaks", () => {
  it("checks n and total - n", () => {
    expect(numeratorLeaks(g(100), g(0.03))).toBe(true); // n = 3
    expect(numeratorLeaks(g(100), g(0.98))).toBe(true); // 100 - n = 2
    expect(numeratorLeaks(g(100), g(0.5))).toBe(false);
    expect(numeratorLeaks(g(100), g(0))).toBe(false);
    expect(numeratorLeaks(g(100), g(1))).toBe(false);
  });
  it("reads a share to the places it was sent with", () => {
    // 0.04 of 100 could be 3.5 to 4.5 people: only 4 rounds to it
    expect(numeratorLeaks(g(100), g(0.04))).toBe(true);
    // 0.05 of 100 could be 4.5 to 5.5: 5 is not small, but nor can 4 be ruled out
    expect(numeratorLeaks(g(100), g(0.05))).toBe(false);
    // a coarse share of a large total can't tell 4 from 5
    expect(numeratorLeaks(g(1000), g(0.005))).toBe(false);
  });
  it("only a shown total and a shown share can leak", () => {
    expect(numeratorLeaks(H, g(0.03))).toBe(false);
    expect(numeratorLeaks(g(100), H)).toBe(false);
  });
});

describe("setGivesAway", () => {
  it("one hidden member gives itself away", () => {
    expect(setGivesAway(g(50), [g(20), H, g(30)])).toBe(true);
    expect(setGivesAway(null, [g(20), H])).toBe(true);
  });
  it("hidden members under 5 give themselves away", () => {
    expect(setGivesAway(g(50), [g(46), H, H])).toBe(true);
    expect(setGivesAway(g(50), [g(30), H, H])).toBe(false);
  });
  it("a set with nothing hidden is fine when it adds up", () => {
    expect(setGivesAway(g(50), [g(20), g(30)])).toBe(false);
    expect(setGivesAway(null, [g(20), g(30)])).toBe(false);
  });
});

describe("remainderLeaks", () => {
  it("gap 3 leaks", () => {
    expect(remainderLeaks(g(100), [g(60), g(37), H, H])).toBe(true);
  });
  it("gap 9 over two hidden rows doesn't", () => {
    expect(remainderLeaks(g(100), [g(60), g(31), H, H])).toBe(false);
  });
  it("one hidden row always leaks", () => {
    expect(remainderLeaks(g(100), [g(60), H])).toBe(true);
    expect(remainderLeaks(g(1000), [g(10), H])).toBe(true);
  });
  it("a hidden total never leaks", () => {
    expect(remainderLeaks(H, [g(60), H])).toBe(false);
    expect(remainderLeaks(H, [g(60), g(7)])).toBe(false);
    expect(remainderLeaks(H, [H, H])).toBe(false);
  });
  it("shown rows that don't add up leak", () => {
    expect(remainderLeaks(g(100), [g(60), g(39)])).toBe(true);
    expect(remainderLeaks(g(100), [g(60), g(41)])).toBe(true);
    expect(remainderLeaks(g(100), [g(60), g(40)])).toBe(false);
  });
  it("hidden rows that overshoot the total leak", () => {
    expect(remainderLeaks(g(100), [g(120), H, H])).toBe(true);
  });
});

describe("hasOnlyKeys", () => {
  it("refuses an extra key", () => {
    expect(hasOnlyKeys({ a: 1, b: 2 }, ["a", "b"])).toBe(true);
    expect(hasOnlyKeys({ a: 1 }, ["a", "b"])).toBe(true);
    expect(hasOnlyKeys({ a: 1, name: "x" }, ["a", "b"])).toBe(false);
  });
});

describe("scrub", () => {
  it("drops a hidden value's number", () => {
    expect(scrub({ value: 3, suppressed: true })).toEqual({
      value: null,
      suppressed: true,
    });
  });
  it("keeps a drill only while shown, 5 or more and opaque", () => {
    expect(scrub({ value: 9, suppressed: false, drill: "ab_1" })).toEqual({
      value: 9,
      suppressed: false,
      drill: "ab_1",
    });
    expect(scrub({ value: 9, suppressed: false, drill: "a b" })).toEqual({
      value: 9,
      suppressed: false,
      drill: null,
    });
    expect(scrub({ value: 3, suppressed: true, drill: "ab" })).toEqual({
      value: null,
      suppressed: true,
      drill: null,
    });
    expect(scrub({ value: 3, suppressed: false, drill: "ab" })).toEqual({
      value: 3,
      suppressed: false,
      drill: null,
    });
  });
  it("goes deep and keeps shown values", () => {
    const out = scrub({
      rows: [
        {
          n: { value: 2, suppressed: true },
          m: { value: 9, suppressed: false },
        },
      ],
      label: "x",
    });
    expect(out).toEqual({
      rows: [{ n: H, m: g(9) }],
      label: "x",
    });
  });
});
