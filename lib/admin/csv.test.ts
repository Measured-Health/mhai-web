import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_NOW as NOW, makeEvent } from "@/tests/admin";
import {
  CSV_MAX_ROWS,
  activityCsv,
  csvCell,
  csvName,
  downloadCsv,
  toCsv,
  usageCsv,
} from "./csv";

afterEach(() => vi.restoreAllMocks());

describe("CSV (R10)", () => {
  it("quotes what needs quoting", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", twice')).toBe('"say ""hi"", twice"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("stops a spreadsheet from running a cell", () => {
    for (const bad of ['=HYPERLINK("x")', "+1", "-2", "@SUM(A1)", "\tx", "\rx"])
      expect(csvCell(bad).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell(-2)).toBe("-2"); // a real number stays a number
  });

  it("writes a UTF-8 file Excel opens, with CRLF lines", () => {
    expect(toCsv(["A", "B"], [["x", 1]])).toBe("\uFEFFA,B\r\nx,1\r\n");
  });

  it("exports usage as counts only", () => {
    const csv = usageCsv(
      {
        period: "this_month",
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-16T10:00:00.000Z",
        consultations: 1284,
        active_clinicians: 39,
        agreement_rate: 0.82,
        median_review_hours: 3.1,
        confidence: { high: 796, caution: 347, review: 103, failed: 38 },
        by_specialty: [{ specialty: "Paediatrics", consultations: 318 }],
      },
      "Havana Hospital",
    );
    expect(csv.split("\r\n")).toEqual([
      "\uFEFFMeasure,Value",
      "Hospital,Havana Hospital",
      "Period,This month (2026-10-01 to 2026-10-16)",
      "Consultations,1284",
      "Active clinicians,39",
      "Agreed with result (%),82",
      "Median review time (hours),3.1",
      "Result: High confidence,796",
      "Result: Use with caution,347",
      "Result: Needs review,103",
      "Result: Couldn't complete,38",
      "Specialty: Paediatrics,318",
      "",
    ]);
  });

  it("exports activity from structured fields only (privacy)", () => {
    const sneaky = {
      ...makeEvent({
        kind: "consultation_run",
        type: "consultation",
        specialty: "Cardiology",
        confidence: "review",
        flag: null,
        at: "2026-10-16T09:31:00.000Z",
        actor: { display_name: "Dr. Bello" },
      }),
      question_text: "chest pain in John Smith",
    };
    const csv = activityCsv([
      sneaky,
      makeEvent({
        kind: "sign_in_locked",
        type: "security",
        actor: null,
        target: { display_name: "=cmd()" },
        count: 5,
        flag: "alert",
        at: "2026-10-16T08:55:00.000Z",
      }),
    ]);
    expect(csv).not.toMatch(/John|chest/);
    expect(csv.split("\r\n").slice(0, 3)).toEqual([
      "\uFEFFTime (UTC),Who,Type,What happened,Flag",
      "2026-10-16T09:31:00.000Z,Dr. Bello,Consultation,Ran a consultation · Cardiology · Needs review,",
      "2026-10-16T08:55:00.000Z,System,Security,5 failed sign-ins for =cmd() · account locked,Alert",
    ]);
  });

  it("exports a self role change with its flag", () => {
    const csv = activityCsv([
      makeEvent({
        kind: "self_role_change",
        type: "security",
        actor: { display_name: "Grace Nwosu" },
        target: { display_name: "Grace Nwosu" },
        roles_added: ["clinician"],
        flag: "alert",
        at: "2026-10-17T09:00:00.000Z",
      }),
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      "2026-10-17T09:00:00.000Z,Grace Nwosu,Security,Gave themselves the Clinician role,Alert",
    );
    expect(csv).not.toContain("self_role_change");
  });

  it("names the file after the hospital and the day", () => {
    expect(csvName("activity", "Havana Hospital", NOW)).toBe(
      "havana-hospital-activity-2026-10-16.csv",
    );
  });

  it("downloads from memory and lets the URL go", async () => {
    const create = vi.fn(() => "blob:demo");
    const revoke = vi.fn();
    const original = [URL.createObjectURL, URL.revokeObjectURL] as const;
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    try {
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      downloadCsv("x.csv", "a,b\r\n");
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledTimes(1);
      expect(document.querySelector("a[download]")).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:demo"));
      expect(localStorage.length + sessionStorage.length).toBe(0);
    } finally {
      [URL.createObjectURL, URL.revokeObjectURL] = original;
    }
  });
});

describe("CSV row cap", () => {
  it("stops at the export limit", () => {
    const many = Array.from({ length: CSV_MAX_ROWS + 5 }, () => makeEvent());
    expect(activityCsv(many).split("\r\n").length).toBe(CSV_MAX_ROWS + 2);
  });
});
