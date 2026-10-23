import { describe, expect, it } from "vitest";
import {
  activeWords,
  COVER_MAX,
  dayLabel,
  daysBetween,
  ENDING_SOON_DAYS,
  endedWords,
  LETTER_MAX_BYTES,
  LETTER_MAX_PAGES,
  NARROW_LABEL,
  NOTE_MAX,
  POSITION_LABEL,
  POSITION_ORDER,
  REFUSED_TEXT,
  REJECT_LABEL,
  REVOKE_LABEL,
  revokedWords,
  STATUS_LABEL,
} from "./clearances";

describe("clearances", () => {
  it("the refused, reject and revoke words are the spec's", () => {
    expect(REFUSED_TEXT).toEqual({
      file_type: "This file type isn't accepted",
      file_too_large: "The file is larger than 10 MB",
      too_many_pages: "The letter has more than 20 pages",
      password_protected: "Password-protected files can't be accepted",
      unreadable: "The file couldn't be read",
      failed_safety_check: "The file didn't pass the safety check",
    });
    expect(REJECT_LABEL).toEqual({
      wrong_people: "Doesn't name these people",
      end_date_mismatch: "End date doesn't match",
      not_leadership: "Not signed by leadership",
      unreadable: "Can't read it",
      other: "Other",
    });
    expect(REVOKE_LABEL).toEqual({
      no_longer_needed: "No longer needed",
      person_left: "Person left or changed role",
      uploaded_in_error: "Uploaded in error",
      security_concern: "Security concern",
      other: "Other",
    });
    expect(NARROW_LABEL).toEqual({
      person_left: "Person left or changed role",
      no_longer_needed: "No longer needed",
      uploaded_in_error: "Uploaded in error",
      other: "Other",
    });
  });

  it("the positions read Off, Letters only and On, in that order", () => {
    expect(POSITION_LABEL).toEqual({
      off: "Off",
      letters_only: "Letters only",
      on: "On",
    });
    expect(POSITION_ORDER).toEqual(["off", "letters_only", "on"]);
  });

  it("the limits are the spec's", () => {
    expect(LETTER_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(LETTER_MAX_PAGES).toBe(20);
    expect(COVER_MAX).toBe(20);
    expect(NOTE_MAX).toBe(500);
    expect(ENDING_SOON_DAYS).toBe(30);
  });

  it("dayLabel writes 12 Mar 2027", () => {
    expect(dayLabel("2027-03-12")).toBe("12 Mar 2027");
    expect(dayLabel("2026-01-05")).toBe("5 Jan 2026");
    expect(dayLabel("2026-12-31")).toBe("31 Dec 2026");
  });

  it("dayLabel refuses anything that isn't a real day", () => {
    for (const bad of ["2027-3-12", "12 Mar 2027", "2027-02-30", "2027-13-01"])
      expect(() => dayLabel(bad)).toThrow(RangeError);
  });

  it("daysBetween counts whole days, including across a month end", () => {
    expect(daysBetween("2026-10-23", "2026-10-23")).toBe(0);
    expect(daysBetween("2026-10-23", "2026-10-24")).toBe(1);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2027-02-27", "2027-03-01")).toBe(2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    // Across a clock change: still whole days.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-11-02", "2026-10-30")).toBe(-3);
  });

  it("the one set of letter status words", () => {
    expect(STATUS_LABEL).toEqual({
      checking: "Checking the file",
      refused: "Couldn't accept the file",
      waiting: "Waiting for Measured Health",
      active: "Active",
      rejected: "Rejected",
      ended: "Ended",
      revoked: "Revoked",
    });
    expect(activeWords("2027-03-12", "2026-10-23")).toBe(
      "Active until 12 Mar 2027",
    );
    expect(activeWords("2026-11-22", "2026-10-23")).toBe("Ends in 30 days");
    expect(activeWords("2026-11-23", "2026-10-23")).toBe(
      "Active until 23 Nov 2026",
    );
    expect(activeWords("2026-10-24", "2026-10-23")).toBe("Ends in 1 day");
    expect(activeWords("2026-10-23", "2026-10-23")).toBe("Ends today");
    expect(endedWords("2026-10-01")).toBe("Ended 1 Oct 2026");
    expect(revokedWords("2026-10-02")).toBe("Revoked 2 Oct 2026");
  });
});
