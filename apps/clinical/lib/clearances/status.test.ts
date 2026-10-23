import { describe, expect, it } from "vitest";
import type { ClearanceOut } from "../api/clearances-contract";
import { statusLine } from "./status";

const TODAY = "2026-10-23";
const letter = (over: Partial<ClearanceOut>): ClearanceOut => ({
  id: "cl_1",
  status: "active",
  refused_reason: null,
  signed_by: "A",
  signer_title: "CEO",
  letter_date: "2026-09-01",
  covered: [],
  covered_platform: [],
  end_date: "2027-03-12",
  uploaded_by: { display_name: "U" },
  uploaded_at: "2026-09-02T09:00:00Z",
  verified_by: null,
  verified_at: null,
  rejection: null,
  revocation: null,
  renews: null,
  pages: 1,
  history: [],
  version: 1,
  ...over,
});

describe("statusLine", () => {
  it("gives every status its words and icon", () => {
    expect(statusLine(letter({ status: "checking" }), TODAY)).toEqual({
      icon: "clock",
      words: "Checking the file",
      detail: null,
    });
    expect(
      statusLine(
        letter({ status: "refused", refused_reason: "file_type" }),
        TODAY,
      ),
    ).toEqual({
      icon: "x",
      words: "Couldn't accept the file",
      detail: "This file type isn't accepted",
    });
    expect(statusLine(letter({ status: "waiting" }), TODAY)).toEqual({
      icon: "hourglass",
      words: "Waiting for Measured Health",
      detail: null,
    });
    expect(
      statusLine(
        letter({
          status: "rejected",
          rejection: {
            reason: "wrong_people",
            note: "Missing Dr Obi",
            at: "2026-10-01T10:00:00Z",
          },
        }),
        TODAY,
      ),
    ).toEqual({
      icon: "ban",
      words: "Rejected",
      detail: "Doesn't name these people · Missing Dr Obi",
    });
    expect(
      statusLine(
        letter({
          status: "rejected",
          rejection: {
            reason: "other",
            note: null,
            at: "2026-10-01T10:00:00Z",
          },
        }),
        TODAY,
      ).detail,
    ).toBe("Other");
    expect(
      statusLine(letter({ status: "ended", end_date: "2026-10-01" }), TODAY),
    ).toEqual({ icon: "calendar-x", words: "Ended 1 Oct 2026", detail: null });
    expect(
      statusLine(
        letter({
          status: "revoked",
          revocation: {
            by: { display_name: "Ada Admin" },
            side: "hospital",
            at: "2026-10-02T08:00:00Z",
            day: "2026-10-02",
            reason: "person_left",
            note: null,
          },
        }),
        TODAY,
      ),
    ).toEqual({
      icon: "ban",
      words: "Revoked 2 Oct 2026",
      detail: "By Ada Admin · Person left or changed role",
    });
  });

  it("active reads Active until a date when 31 days or more away", () => {
    expect(statusLine(letter({}), TODAY)).toEqual({
      icon: "check",
      words: "Active until 12 Mar 2027",
      detail: null,
    });
    expect(statusLine(letter({ end_date: "2026-11-23" }), TODAY).words).toBe(
      "Active until 23 Nov 2026",
    );
  });

  it("active within 30 days reads Ends in n days, 1 day, or today", () => {
    const w = (end: string) => statusLine(letter({ end_date: end }), TODAY);
    expect(w("2026-11-04")).toEqual({
      icon: "alert",
      words: "Ends in 12 days",
      detail: null,
    });
    expect(w("2026-10-24").words).toBe("Ends in 1 day");
    expect(w("2026-10-23")).toMatchObject({
      icon: "alert",
      words: "Ends today",
    });
  });

  it("an active letter whose end date has passed reads as ended", () => {
    expect(statusLine(letter({ end_date: "2026-10-22" }), TODAY)).toEqual({
      icon: "calendar-x",
      words: "Ended 22 Oct 2026",
      detail: null,
    });
  });

  it("Ends in 30 days at 30, Active until at 31", () => {
    expect(statusLine(letter({ end_date: "2026-11-22" }), TODAY).words).toBe(
      "Ends in 30 days",
    );
    expect(statusLine(letter({ end_date: "2026-11-23" }), TODAY).icon).toBe(
      "check",
    );
  });

  it("revoked uses the server's hospital day, and never a cut instant", () => {
    const rev = (day?: string) =>
      letter({
        status: "revoked",
        revocation: {
          by: { display_name: "Ada" },
          side: "hospital",
          at: "2026-10-02T23:30:00Z",
          ...(day ? { day } : {}),
          reason: "other",
          note: null,
        },
      });
    expect(statusLine(rev("2026-10-03"), TODAY).words).toBe(
      "Revoked 3 Oct 2026",
    );
    expect(statusLine(rev(), TODAY).words).toBe("Revoked");
    expect(statusLine(letter({ status: "revoked" }), TODAY)).toEqual({
      icon: "ban",
      words: "Revoked",
      detail: null,
    });
  });

  it("a malformed date fails closed instead of throwing", () => {
    expect(statusLine(letter({ end_date: "2026-02-31" }), TODAY)).toEqual({
      icon: "calendar-x",
      words: "Ended",
      detail: null,
    });
    expect(statusLine(letter({}), "bad").words).toBe("Ended");
  });
});
