import { describe, expect, it } from "vitest";
import {
  LOOKUP_IN,
  mrnProblem,
  normaliseMrn,
  readLookup,
} from "./lookup-schema";

const FOUND = {
  id: "6f1c2a01-5e1d-4c3b-9a7e-000000000001",
  full_name: "Maryam Abdullahi",
  mrn: "SYN-204817",
  age: 67,
  sex: "female",
};

describe("the MRN rule", () => {
  it.each(["204817", "SYN-204817", " syn 204/817.a_b ", "a".repeat(64)])(
    "takes %j",
    (mrn) => {
      expect(mrnProblem(mrn)).toBeNull();
      expect(LOOKUP_IN.safeParse({ mrn }).success).toBe(true);
    },
  );

  it.each([
    ["empty", ""],
    ["spaces only", "   "],
  ])("calls %s empty", (_, mrn) => expect(mrnProblem(mrn)).toBe("empty"));

  it.each([
    ["too long", "a".repeat(65)],
    ["a wildcard", "2048%"],
    ["a star", "2048*"],
    ["a quote", "20'48"],
    ["a control character", "20\u000048"],
    ["a newline", "20\n48"],
    ["a leading hyphen", "-2048"],
    ["a trailing dot", "2048."],
    ["a path", "../hospital"],
    ["a non-ASCII letter", "２０４８"],
  ])("refuses %s", (_, mrn) => {
    expect(mrnProblem(mrn)).toBe("invalid");
    expect(LOOKUP_IN.safeParse({ mrn }).success).toBe(false);
  });

  it("forwards only {mrn}, trimmed", () => {
    expect(LOOKUP_IN.parse({ mrn: "  SYN-1 " })).toEqual({ mrn: "SYN-1" });
    for (const body of [
      { mrn: "SYN-1", name: "x" },
      { mrn: 204817 },
      { mrn: ["SYN-1"] },
      { mrn: null },
      {},
      "SYN-1",
      { mrn: "x".repeat(300) },
    ])
      expect(LOOKUP_IN.safeParse(body).success).toBe(false);
  });

  it("normalises as core does: no spaces, upper case", () =>
    expect(normaliseMrn(" syn 204817 ")).toBe("SYN204817"));
});

describe("the reply", () => {
  it("reads one patient for the MRN asked about", () => {
    expect(readLookup(FOUND, "syn-204817")).toEqual(FOUND);
    expect(
      readLookup({ ...FOUND, full_name: null, age: null }, "SYN-204817"),
    ).not.toBeNull();
  });

  it.each([
    ["an extra key", { ...FOUND, dob: "1959-01-01" }],
    ["a list", [FOUND]],
    ["another MRN", { ...FOUND, mrn: "SYN-999" }],
    ["an upper-case id", { ...FOUND, id: FOUND.id.toUpperCase() }],
    ["the nil id", { ...FOUND, id: "00000000-0000-0000-0000-000000000000" }],
    ["an unknown sex", { ...FOUND, sex: "x" }],
    ["a negative age", { ...FOUND, age: -1 }],
    ["an empty name", { ...FOUND, full_name: " " }],
    ["no MRN", { ...FOUND, mrn: undefined }],
  ])("fails closed on %s", (_, raw) =>
    expect(readLookup(raw, "SYN-204817")).toBeNull(),
  );
});
