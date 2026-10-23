import { describe, expect, it } from "vitest";
import { letter } from "@/tests/clearance-fixture";
import { BLOCK_TEXT, CHECKLIST, statusText, verifiedToast } from "./labels";

const TODAY = "2026-10-23";

describe("statusText", () => {
  it("words every status with an icon", () => {
    const s = (over: Parameters<typeof letter>[0]) =>
      statusText(letter(over), TODAY);
    expect(s({ status: "checking" })).toEqual({
      icon: "clock",
      words: "Checking the file",
    });
    expect(s({ status: "refused" })).toEqual({
      icon: "x",
      words: "Couldn't accept the file",
    });
    expect(s({ status: "waiting" })).toEqual({
      icon: "hourglass",
      words: "Waiting for Measured Health",
    });
    expect(s({ status: "rejected" })).toEqual({
      icon: "ban",
      words: "Rejected",
    });
    expect(s({ status: "ended" })).toEqual({
      icon: "calendar-x",
      words: "Ended 12 Mar 2027",
    });
    expect(
      s({
        status: "revoked",
        revocation: {
          by: { id: "a", name: "Ada" },
          side: "platform",
          at: "2026-10-01T23:30:00Z",
          day: "2026-10-02",
          reason: "other",
          note: null,
        },
      }),
    ).toEqual({ icon: "ban", words: "Revoked 2 Oct 2026" });
  });
  it("counts an active letter down to its end", () => {
    const s = (end: string) =>
      statusText(letter({ status: "active", end_date: end }), TODAY);
    expect(s("2027-03-12")).toEqual({
      icon: "check",
      words: "Active until 12 Mar 2027",
    });
    expect(s("2026-11-12")).toEqual({
      icon: "alert",
      words: "Ends in 20 days",
    });
    expect(s("2026-10-24").words).toBe("Ends in 1 day");
    expect(s("2026-10-23").words).toBe("Ends today");
  });
  it("reads an active letter past its end as ended, and survives a bad date", () => {
    expect(
      statusText(letter({ status: "active", end_date: "2026-10-22" }), TODAY),
    ).toEqual({ icon: "calendar-x", words: "Ended 22 Oct 2026" });
    expect(
      statusText(letter({ status: "active", end_date: "garbage" }), TODAY),
    ).toEqual({ icon: "calendar-x", words: "Ended" });
  });
});

describe("CHECKLIST", () => {
  it("is the spec's four lines", () => {
    expect(CHECKLIST).toEqual([
      "The letter is on hospital letterhead and signed by the stated person",
      "It names the same people as entered",
      "Its end date matches, and is no more than 12 months away",
      "It authorises viewing patient names for analysis",
    ]);
  });
});

describe("BLOCK_TEXT", () => {
  it("words each block", () => {
    expect(BLOCK_TEXT.covers_you).toBe(
      "You can't verify a letter that covers you",
    );
    expect(BLOCK_TEXT.same_side).toBe(
      "You can't verify letters from a hospital you're linked to",
    );
    expect(BLOCK_TEXT.not_ready).toBe(
      "Can't verify while the file is being checked",
    );
  });
});

describe("verifiedToast", () => {
  it("counts everyone the letter names when names are On", () => {
    expect(verifiedToast(letter(), "on")).toBe(
      "Verified. 3 people can now see names",
    );
  });
  it("says person for one", () => {
    expect(
      verifiedToast(
        letter({ covered: [{ id: "s1", name: "Kemi" }], covered_platform: [] }),
        "on",
      ),
    ).toBe("Verified. 1 person can now see names");
  });
  it("says names stay hidden otherwise", () => {
    const hidden =
      "Verified. Names stay hidden until named access is switched on";
    expect(verifiedToast(letter(), "letters_only")).toBe(hidden);
    expect(verifiedToast(letter(), "off")).toBe(hidden);
  });
});
