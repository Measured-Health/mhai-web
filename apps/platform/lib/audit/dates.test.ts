import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET, checkCustomRange, rangeOf } from "./dates";

const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min);
const iso = (y: number, m: number, d: number) => at(y, m, d).toISOString();
const NOW = at(2026, 10, 22, 14, 30).getTime();

describe("audit date ranges", () => {
  it("presets give local-midnight bounds", () => {
    expect(DEFAULT_PRESET).toBe("30d");
    const to = iso(2026, 10, 23);
    expect(rangeOf("today", NOW)).toEqual({ from: iso(2026, 10, 22), to });
    expect(rangeOf("7d", NOW)).toEqual({ from: iso(2026, 10, 16), to });
    expect(rangeOf("30d", NOW)).toEqual({ from: iso(2026, 9, 23), to });
    expect(rangeOf("12m", NOW)).toEqual({ from: iso(2025, 10, 23), to });
  });

  it("custom From after To is refused", () => {
    expect(checkCustomRange("2026-10-10", "2026-10-09", NOW)).toEqual({
      error: "Choose a From date on or before the To date.",
    });
  });

  it("custom To in the future is refused", () => {
    expect(checkCustomRange("2026-10-10", "2026-10-23", NOW)).toEqual({
      error: "The To date can't be in the future.",
    });
    expect(checkCustomRange("2026-10-10", "2026-10-22", NOW)).toEqual({
      from: iso(2026, 10, 10),
      to: iso(2026, 10, 23),
    });
  });

  it("custom one day gives [d, d+1)", () => {
    expect(checkCustomRange("2026-10-01", "2026-10-01", NOW)).toEqual({
      from: iso(2026, 10, 1),
      to: iso(2026, 10, 2),
    });
    // Across a month end.
    expect(checkCustomRange("2026-09-30", "2026-09-30", NOW)).toEqual({
      from: iso(2026, 9, 30),
      to: iso(2026, 10, 1),
    });
  });

  it("a missing or impossible date is refused", () => {
    expect(checkCustomRange("", "2026-10-01", NOW)).toHaveProperty("error");
    expect(checkCustomRange("2026-02-30", "2026-03-01", NOW)).toHaveProperty(
      "error",
    );
  });
});
