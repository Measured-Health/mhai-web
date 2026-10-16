import { describe, expect, it } from "vitest";
import { ageLabel, ago } from "./time";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const MIN = 60_000;

describe("relative time", () => {
  it("rounds minutes and hours, never negative", () => {
    expect(ago(NOW - 42 * MIN, NOW)).toBe("42 min");
    expect(ago(NOW - 90 * MIN, NOW)).toBe("2 h");
    expect(ago(NOW - 50 * 60 * MIN, NOW)).toBe("50 h");
    expect(ago(NOW + MIN, NOW)).toBe("0 min");
  });

  it("ageLabel matches ago below a day and reads days after", () => {
    expect(ageLabel(NOW - 42 * MIN, NOW)).toBe("42 min");
    expect(ageLabel(NOW - (3 * 60 + 59) * MIN, NOW)).toBe("4 h");
    expect(ageLabel(NOW - 50 * 60 * MIN, NOW)).toBe("2 d");
    expect(ageLabel(NOW + MIN, NOW)).toBe("0 min");
  });
});
