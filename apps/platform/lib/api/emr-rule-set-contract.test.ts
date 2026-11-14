import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { readEmrRuleSet } from "./emr-rule-set-contract";

const SHA = "ab".repeat(32);
const ON = {
  hospital_id: "h1",
  version: "0-synthetic",
  sha256: SHA,
  activated_at: "2026-11-14T09:00:00Z",
};
const bad = new ApiError(502, "bad_gateway");

describe("readEmrRuleSet", () => {
  it("reads a rule set and shadow", () => {
    expect(readEmrRuleSet(ON, "h1")).toEqual(ON);
    const shadow = {
      hospital_id: "h1",
      version: null,
      sha256: null,
      activated_at: null,
    };
    expect(readEmrRuleSet(shadow, "h1")).toEqual(shadow);
  });

  it.each([
    ["another hospital's", ON, "h2"],
    ["an extra key", { ...ON, rules: 3 }, "h1"],
    ["a missing key", { hospital_id: "h1", version: null, sha256: null }, "h1"],
    ["half a rule set", { ...ON, sha256: null }, "h1"],
    ["an upper-case hash", { ...ON, sha256: SHA.toUpperCase() }, "h1"],
    ["a bad version", { ...ON, version: "V1" }, "h1"],
    ["a bad time", { ...ON, activated_at: "yesterday" }, "h1"],
    ["nothing", null, "h1"],
  ])("fails closed on %s", (_, v, id) => {
    expect(() => readEmrRuleSet(v, id)).toThrow(bad);
  });
});
