import { describe, expect, it } from "vitest";
import type { ClearanceOut } from "../api/clearances-contract";
import { accessSummary, errorText, namedAccessFor } from "./summary";
import { ApiError } from "../api/errors";
import { NotEligibleError } from "@mhai/api-client/errors";

const letter = (
  id: string,
  status: ClearanceOut["status"],
  end: string,
  covered: string[],
): ClearanceOut =>
  ({
    id,
    status,
    end_date: end,
    covered: covered.map((c) => ({ id: c, display_name: c })),
  }) as ClearanceOut;

describe("namedAccessFor", () => {
  it("takes the latest active letter and ignores waiting ones", () => {
    const list = [
      letter("a", "active", "2026-12-01", ["s1"]),
      letter("b", "active", "2027-03-12", ["s1", "s2"]),
      letter("c", "waiting", "2027-09-01", ["s1"]),
      letter("d", "revoked", "2027-10-01", ["s1"]),
    ];
    expect(namedAccessFor("s1", list)).toEqual({ until: "2027-03-12" });
    expect(namedAccessFor("s2", list)).toEqual({ until: "2027-03-12" });
    expect(namedAccessFor("s3", list)).toBeNull();
  });
  it("ignores an active letter that has passed its end date when given today", () => {
    const list = [letter("a", "active", "2026-10-22", ["s1"])];
    expect(namedAccessFor("s1", list)).toEqual({ until: "2026-10-22" });
    expect(namedAccessFor("s1", list, "2026-10-23")).toBeNull();
    expect(namedAccessFor("s1", list, "2026-10-22")).toEqual({
      until: "2026-10-22",
    });
  });
});

describe("accessSummary", () => {
  it("says nobody when no active letter covers anyone", () => {
    expect(accessSummary([])).toBe("Nobody has named access");
    expect(accessSummary([letter("a", "waiting", "2027-01-01", ["s1"])])).toBe(
      "Nobody has named access",
    );
  });
  it("says one person with their date", () => {
    expect(accessSummary([letter("a", "active", "2027-03-12", ["s1"])])).toBe(
      "1 person has named access until 12 Mar 2027",
    );
  });
  it("says n people with one shared date", () => {
    expect(
      accessSummary([
        letter("a", "active", "2027-03-12", ["s1", "s2"]),
        letter("b", "active", "2027-03-12", ["s2", "s3"]),
      ]),
    ).toBe("3 people have named access until 12 Mar 2027");
  });
  it("counts each person at their latest end and names the earliest", () => {
    expect(
      accessSummary([
        letter("a", "active", "2026-12-01", ["s1", "s2"]),
        letter("b", "active", "2027-03-12", ["s2"]),
      ]),
    ).toBe("2 people have named access; the earliest ends 1 Dec 2026");
  });
  it("counts people with the same latest date once, even if letters differ", () => {
    expect(
      accessSummary([
        letter("a", "active", "2026-12-01", ["s1"]),
        letter("b", "active", "2027-03-12", ["s1"]),
      ]),
    ).toBe("1 person has named access until 12 Mar 2027");
  });
  it("drops letters past their end date when given today", () => {
    expect(
      accessSummary(
        [letter("a", "active", "2026-10-22", ["s1"])],
        "2026-10-23",
      ),
    ).toBe("Nobody has named access");
  });
});

describe("errorText", () => {
  const e = (code: string) => new ApiError(400, code);
  it("maps each code to words", () => {
    expect(errorText(e("end_date_too_late"))).toBe(
      "The end date can't be more than 12 months away",
    );
    expect(errorText(e("conflict"))).toBe("Changed by someone else");
    expect(errorText(e("would_empty"))).toBe(
      "To remove everyone, revoke the letter",
    );
    expect(errorText(e("file_too_large"))).toBe(
      "The file is larger than 10 MB",
    );
    expect(errorText(e("file_type"))).toBe("This file type isn't accepted");
    expect(errorText(e("named_access_off"))).toBe(
      "Named access isn't available yet",
    );
    expect(errorText(e("mfa_invalid"))).toBe(
      "That code didn't work. Try again.",
    );
    expect(errorText(e("mfa_locked"))).toBe(
      "Too many tries. Wait 15 minutes, then try again.",
    );
    expect(errorText(e("invalid"))).toBe(
      "Check what you entered and try again",
    );
  });
  it("not_eligible names the refused people when it can", () => {
    const err = new NotEligibleError("not_eligible", { ids: ["s1", "s2"] });
    expect(errorText(err)).toBe(
      "Someone you picked can't be covered. Check the list and try again.",
    );
    const names = (id: string) => ({ s1: "Dr Ada", s2: "Dr Obi" })[id];
    expect(errorText(err, names)).toBe(
      "Dr Ada and Dr Obi can't be covered. Check the list and try again.",
    );
    expect(
      errorText(
        new NotEligibleError("not_eligible", { ids: ["s1", "zz"] }),
        names,
      ),
    ).toBe(
      "Someone you picked can't be covered. Check the list and try again.",
    );
  });
  it("not_eligible_platform lists the emails", () => {
    expect(
      errorText(
        new NotEligibleError("not_eligible_platform", {
          emails: ["a@mh.example", "b@mh.example"],
        }),
      ),
    ).toBe(
      "These aren't Measured Health platform admins with two-step: a@mh.example, b@mh.example",
    );
  });
  it("falls back to plain words", () => {
    expect(errorText(new Error("x"))).toBe("Something went wrong. Try again.");
    expect(errorText(e("zzz"))).toBe("Something went wrong. Try again.");
  });
});
