import { describe, expect, it } from "vitest";
import { analysisSignedOff } from "./features";

describe("analysisSignedOff", () => {
  it("is off unless ANALYSIS_SIGNED_OFF is exactly 'true'", () => {
    expect(analysisSignedOff({})).toBe(false);
    expect(analysisSignedOff({ ANALYSIS_SIGNED_OFF: "1" })).toBe(false);
    expect(analysisSignedOff({ ANALYSIS_SIGNED_OFF: "TRUE" })).toBe(false);
    expect(analysisSignedOff({ ANALYSIS_SIGNED_OFF: "true" })).toBe(true);
  });
});
