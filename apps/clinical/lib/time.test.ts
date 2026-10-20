import { describe, expect, it } from "vitest";
import { ageLabel, ago, eventClock } from "./time";

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

describe("eventClock", () => {
  it("shows the time today, the date before, and nothing when unreadable", () => {
    const now = new Date(2026, 9, 17, 9, 0).getTime();
    expect(eventClock(new Date(2026, 9, 17, 8, 42).toISOString(), now)).toBe(
      "08:42",
    );
    expect(eventClock(new Date(2026, 9, 16, 4, 20).toISOString(), now)).toBe(
      "16 Oct 04:20",
    );
    expect(eventClock("not a date", now)).toBe("");
  });
});
