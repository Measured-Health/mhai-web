import { afterEach, describe, expect, it } from "vitest";
import { activityLabel, dateLabel } from "./format";

const TZ = process.env.TZ;
afterEach(() => {
  if (TZ === undefined) delete process.env.TZ;
  else process.env.TZ = TZ;
});

describe("dateLabel", () => {
  it("a timestamp shows the local date (UTC+1 just after local midnight)", () => {
    process.env.TZ = "Etc/GMT-1"; // UTC+1 all year
    expect(dateLabel("2026-10-20T23:30:00Z")).toBe("21 Oct 2026");
    process.env.TZ = "UTC";
    expect(dateLabel("2026-10-20T23:30:00Z")).toBe("20 Oct 2026");
  });

  it("a date-only value stays exactly as given in any zone", () => {
    for (const tz of ["Etc/GMT-1", "Etc/GMT+10", "UTC"]) {
      process.env.TZ = tz;
      expect(dateLabel("2031-03-03")).toBe("3 Mar 2031");
    }
  });

  it("months are fixed three-letter English names, September included", () => {
    process.env.TZ = "UTC";
    expect(dateLabel("2026-09-05")).toBe("5 Sep 2026");
    expect(dateLabel("2026-09-15T12:00:00Z")).toBe("15 Sep 2026");
    expect(dateLabel("2026-01-01")).toBe("1 Jan 2026");
    expect(dateLabel("2026-12-31")).toBe("31 Dec 2026");
  });

  it("activityLabel says when there's no activity", () => {
    expect(activityLabel(null)).toBe("No activity yet");
  });
});
