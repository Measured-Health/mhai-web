import { describe, expect, it } from "vitest";
import { analysisSignedOff, namedSignedOff } from "./features";

describe("analysisSignedOff", () => {
  it("is off unless ANALYSIS_SIGNED_OFF is exactly 'true'", () => {
    expect(analysisSignedOff({})).toBe(false);
    expect(analysisSignedOff({ ANALYSIS_SIGNED_OFF: "1" })).toBe(false);
    expect(analysisSignedOff({ ANALYSIS_SIGNED_OFF: "TRUE" })).toBe(false);
    expect(analysisSignedOff({ ANALYSIS_SIGNED_OFF: "true" })).toBe(true);
  });
});

describe("namedSignedOff", () => {
  it("named is off unless NAMED_ACCESS_SIGNED_OFF is exactly 'true'", () => {
    expect(namedSignedOff({})).toBe(false);
    expect(namedSignedOff({ NAMED_ACCESS_SIGNED_OFF: "1" })).toBe(false);
    expect(namedSignedOff({ NAMED_ACCESS_SIGNED_OFF: "TRUE" })).toBe(false);
    expect(namedSignedOff({ NAMED_ACCESS_SIGNED_OFF: " true" })).toBe(false);
    expect(namedSignedOff({ ANALYSIS_SIGNED_OFF: "true" })).toBe(false);
    expect(namedSignedOff({ NAMED_ACCESS_SIGNED_OFF: "true" })).toBe(true);
  });
});
