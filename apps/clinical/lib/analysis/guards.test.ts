import { describe, expect, it } from "vitest";
import type { GuardedOut } from "../api/admin-contract";
import { guardedOk, numeratorLeaks, scrub, setGivesAway } from "./guards";

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const NONE: GuardedOut = { value: null, suppressed: false };

describe("guardedOk", () => {
  it("0 shows, 1–4 hidden", () => {
    expect(guardedOk(S(0), "count")).toBe(true);
    expect(guardedOk(H, "count")).toBe(true);
    for (const n of [1, 2, 3, 4]) expect(guardedOk(S(n), "count")).toBe(false);
    expect(guardedOk(S(5), "count")).toBe(true);
  });

  it("a count of 12.5 fails; a median of 12.5 minutes reads", () => {
    expect(guardedOk(S(12.5), "count")).toBe(false);
    expect(guardedOk(S(12.5), "minutes", true)).toBe(true);
    expect(guardedOk(S(12.3), "minutes", true)).toBe(false);
    expect(guardedOk(S(37 / 3), "minutes", true)).toBe(false);
    expect(guardedOk(S(-1), "minutes", true)).toBe(false);
  });

  it("shares are 0 to 1", () => {
    expect(guardedOk(S(0), "share")).toBe(true);
    expect(guardedOk(S(1), "share")).toBe(true);
    expect(guardedOk(S(1.2), "share")).toBe(false);
    expect(guardedOk(S(-0.1), "share")).toBe(false);
  });

  it("nothing to measure reads only where loose", () => {
    expect(guardedOk(NONE, "count")).toBe(false);
    expect(guardedOk(NONE, "share", true)).toBe(true);
    expect(guardedOk(NONE, "minutes", true)).toBe(true);
  });

  it("refuses a wrong shape", () => {
    for (const v of [
      null,
      undefined,
      12,
      "12",
      [],
      { value: 12 },
      { value: "12", suppressed: false },
      { value: Number.NaN, suppressed: false },
      { value: Infinity, suppressed: false },
      { value: 12, suppressed: "false" },
      { value: 3, suppressed: true },
    ])
      expect(guardedOk(v, "count", true), JSON.stringify(v)).toBe(false);
  });
});

describe("setGivesAway", () => {
  it("one hidden member of a shown total gives it away", () => {
    expect(setGivesAway(S(215), [S(212), H, S(0), S(0)])).toBe(true);
  });

  it("female 212, male hidden, total 215 gives male away even beside another hidden", () => {
    expect(setGivesAway(S(215), [S(212), H, H])).toBe(true);
  });

  it("two hidden members that add up to 5 or more read", () => {
    expect(setGivesAway(S(220), [S(210), H, H])).toBe(false);
  });

  it("a set with nothing hidden that adds up reads", () => {
    expect(setGivesAway(S(20), [S(12), S(8), S(0)])).toBe(false);
  });

  it("a set that doesn't add up, or leaves 1–4 unlisted, gives away", () => {
    expect(setGivesAway(S(20), [S(12), S(10)])).toBe(true);
    expect(setGivesAway(S(20), [S(12), S(5)])).toBe(true);
  });

  it("everything hidden reads", () => {
    expect(setGivesAway(H, [H, H, S(0)])).toBe(false);
  });

  it("a hidden total with exactly one hidden value gives it away", () => {
    // Total hidden, members all shown: the total is their sum.
    expect(setGivesAway(H, [S(0), S(0)])).toBe(true);
    expect(setGivesAway(H, [S(7), H])).toBe(true);
  });

  it("without a total, exactly one hidden member gives away nothing it adds up to", () => {
    expect(setGivesAway(null, [H])).toBe(true);
    expect(setGivesAway(null, [H, H])).toBe(false);
  });
});

describe("numeratorLeaks", () => {
  it("a share that gives away 1–4, or its complement, leaks", () => {
    expect(numeratorLeaks(S(100), S(0.03))).toBe(true);
    expect(numeratorLeaks(S(100), S(0.97))).toBe(true);
    expect(numeratorLeaks(S(100), S(0.5))).toBe(false);
    expect(numeratorLeaks(S(100), S(0))).toBe(false);
    expect(numeratorLeaks(S(100), S(1))).toBe(false);
  });

  it("a share whose rounding can't tell 4 from 5 doesn't leak", () => {
    // 5 of 220 is 0.0227, sent as 0.02: anything from 4 to 6.
    expect(numeratorLeaks(S(220), S(0.02))).toBe(false);
    // Sent to four places it pins 4.
    expect(numeratorLeaks(S(220), S(0.0182))).toBe(true);
  });

  it("matches the mock's rounding for every shown numerator and complement", () => {
    for (let den = 5; den <= 400; den++)
      for (let num = 0; num <= den; num++) {
        const small = (n: number) => n > 0 && n < 5;
        if (small(num) || small(den - num)) continue;
        const sh = Math.round((num / den) * 100) / 100;
        expect(numeratorLeaks(S(den), S(sh)), `${num}/${den}`).toBe(false);
      }
  });

  it("a share no whole numerator rounds to falls back to floor and ceiling", () => {
    // 4 of 6 rounded to one place: 0.7 of 6 is 4.2.
    expect(numeratorLeaks(S(6), S(0.7))).toBe(true);
    // 3.6: 3 or 4.
    expect(numeratorLeaks(S(6), S(0.6))).toBe(true);
    // 50 of 100 is fine either way.
    expect(numeratorLeaks(S(100), S(0.5))).toBe(false);
  });

  it("hidden or nothing never leaks", () => {
    expect(numeratorLeaks(H, S(0.5))).toBe(false);
    expect(numeratorLeaks(S(100), H)).toBe(false);
    expect(numeratorLeaks(S(100), NONE)).toBe(false);
  });
});

describe("scrub", () => {
  it("drops any number sent with a hidden value, and keeps drill keys on shown ones", () => {
    const out = scrub({
      a: { value: 3, suppressed: true, drill: "x" },
      b: [{ value: 7, suppressed: false, drill: "age-1" }],
      c: "kept",
      d: { value: 0, suppressed: false, drill: "x" },
    });
    expect(out).toEqual({
      a: { value: null, suppressed: true, drill: null },
      d: { value: 0, suppressed: false, drill: null },
      b: [{ value: 7, suppressed: false, drill: "age-1" }],
      c: "kept",
    });
  });
});
