import { describe, expect, it } from "vitest";
import { auditEvent, checkpoint } from "@/tests/audit-event";
import {
  countWords,
  eventLine,
  filtersInWords,
  gapLine,
  hospitalWords,
  outcomeWords,
  utc,
  whoLine,
} from "./words";

const local = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d).toISOString();

describe("the audit words", () => {
  it("countWords 1, 1284, capped", () => {
    expect(countWords(1, false)).toBe("1 event");
    expect(countWords(0, false)).toBe("0 events");
    expect(countWords(1284, false)).toBe("1,284 events");
    expect(countWords(10_000, true)).toBe("More than 10,000 events");
  });

  it("whoLine for staff, platform and system", () => {
    expect(
      whoLine({
        id: "u_ada",
        name: "Ada Bakare",
        role: "platform_admin",
        kind: "platform",
      }),
    ).toBe("Ada Bakare · Platform admin · Measured Health");
    expect(
      whoLine({
        id: "s_eze",
        name: "Dr N. Eze",
        role: "clinician",
        kind: "staff",
      }),
    ).toBe("Dr N. Eze · Clinician · Hospital staff");
    expect(
      whoLine({
        id: "system",
        name: "Nightly job",
        role: "system",
        kind: "system",
      }),
    ).toBe("System");
  });

  it("a removed hospital reads '(removed)'", () => {
    expect(
      hospitalWords({ id: "h_om", name: "Old Mill Hospital", removed: true }),
    ).toBe("Old Mill Hospital (removed)");
    expect(
      hospitalWords({ id: "h_ng", name: "Northgate", removed: false }),
    ).toBe("Northgate");
    expect(hospitalWords(null)).toBe("Platform");
  });

  it("outcomeWords with and without a reason", () => {
    expect(outcomeWords("refused", "wrong_code")).toBe("Refused · wrong code");
    expect(outcomeWords("succeeded")).toBe("Succeeded");
    expect(outcomeWords("failed", null)).toBe("Failed");
    expect(outcomeWords("succeeded", "contract_ended")).toBe("Succeeded");
  });

  it("eventLine and utc", () => {
    expect(eventLine(auditEvent())).toBe(
      "Deactivated Northgate General Hospital",
    );
    expect(utc("2026-10-22T06:00:00Z")).toBe("22 Oct 2026 06:00 UTC");
    expect(utc("2026-01-03T23:14:59.900Z")).toBe("3 Jan 2026 23:14 UTC");
  });

  it("gapLine before the oldest entry, with and without a checkpoint, and null inside the range", () => {
    const oldest = local(2021, 1, 3);
    const cp = checkpoint({ at: local(2027, 1, 4), before: oldest });
    expect(gapLine(local(2020, 12, 1), oldest, cp)).toBe(
      "Entries before 3 Jan 2021 were removed by retention on 4 Jan 2027 (checkpoint recorded).",
    );
    expect(gapLine(undefined, oldest, cp)).toBe(
      "Entries before 3 Jan 2021 were removed by retention on 4 Jan 2027 (checkpoint recorded).",
    );
    expect(gapLine(local(2020, 12, 1), oldest, null)).toBe(
      "Entries before 3 Jan 2021 are no longer kept.",
    );
    expect(gapLine(oldest, oldest, cp)).toBeNull();
    expect(gapLine(local(2026, 9, 23), oldest, cp)).toBeNull();
  });

  it("filtersInWords lists every set filter", () => {
    expect(
      filtersInWords(
        {
          from: local(2026, 9, 23),
          to: local(2026, 10, 23),
          type: ["sign_in", "security"],
          outcome: "refused",
          flagged: true,
        },
        {},
      ),
    ).toBe(
      "All hospitals · 23 Sep–22 Oct 2026 · Sign-in, Security · Refused · Flagged only",
    );
    expect(
      filtersInWords(
        {
          hospital: "h_ng",
          person: "u_ada",
          from: local(2025, 12, 1),
          to: local(2026, 1, 2),
          q: "P-7F3A2C",
        },
        { hospital: "Northgate General Hospital", person: "Ada Bakare" },
      ),
    ).toBe(
      "Northgate General Hospital · Ada Bakare · 1 Dec 2025–1 Jan 2026 · Searched for a patient id",
    );
    expect(
      filtersInWords(
        {
          hospital: "platform",
          from: local(2026, 10, 22),
          to: local(2026, 10, 23),
        },
        {},
      ),
    ).toBe("Platform only · 22 Oct 2026");
    expect(
      filtersInWords(
        { hospital: "h_ng", clearance: "cl_northgate_2026" },
        {
          hospital: "Northgate General Hospital",
          clearance: "cl_northgate_2026",
        },
      ),
    ).toBe(
      "Northgate General Hospital · Clearance letter cl_northgate_2026 · All dates",
    );
    // The pseudonym searched never shows.
    expect(filtersInWords({ q: "P-7F3A2C" }, {})).not.toContain("P-7F3A2C");
    expect(filtersInWords({ q: { kind: "patient_id" } }, {})).toBe(
      "All hospitals · All dates · Searched for a patient id",
    );
    expect(filtersInWords({ q: "req_1" }, {})).toBe(
      "All hospitals · All dates · Searched for one id",
    );
  });
});
