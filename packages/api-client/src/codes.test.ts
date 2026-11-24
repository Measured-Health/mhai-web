import { describe, expect, it } from "vitest";
import { normalizeBackupCode, readBackupCode } from "./codes";

describe("normalizeBackupCode", () => {
  it.each([
    ["PPPPP QQQQQ", "ppppp-qqqqq"],
    ["ppppp-qqqqq", "ppppp-qqqqq"],
    ["pppppqqqqq", "ppppp-qqqqq"],
    ["ppp", "ppp"],
    ["pppppx", "ppppp-x"],
    ["pppppqqqqqzz", "ppppp-qqqqq"],
    ["", ""],
  ])("%s → %s", (a, b) => expect(normalizeBackupCode(a)).toBe(b));
});

describe("readBackupCode", () => {
  it("takes only core's exact xxxxx-xxxxx shape", () => {
    expect(readBackupCode("ppppp-qqqqq")).toBe("ppppp-qqqqq");
    for (const bad of [
      "PPPPP-QQQQQ",
      " ppppp-qqqqq",
      "pppppqqqqq",
      "ppppp-qqqqq-2",
      "ppppp-qqqq<",
      // 0, 1, i, l and o are never in core's codes
      "pppp0-qqqqq",
      "ppppi-qqqqq",
      "ABCD-2345",
      "",
      null,
      undefined,
      12345678,
      ["ppppp-qqqqq"],
    ])
      expect(readBackupCode(bad)).toBeNull();
  });
});
