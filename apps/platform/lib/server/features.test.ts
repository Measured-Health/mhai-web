import { describe, expect, it } from "vitest";
import { analysisSignedOff, patientViewsSignedOff } from "./features";

const env = (e: Record<string, string | undefined>) => e as NodeJS.ProcessEnv;

describe("the sign-off switches", () => {
  it.each([
    ["ANALYSIS_SIGNED_OFF", analysisSignedOff],
    ["ANALYSIS_PATIENT_VIEWS_SIGNED_OFF", patientViewsSignedOff],
  ] as const)("%s is off unless exactly 'true'", (name, on) => {
    expect(on(env({}))).toBe(false);
    expect(on(env({ [name]: undefined }))).toBe(false);
    for (const v of [
      "",
      "TRUE",
      "True",
      "1",
      "yes",
      "on",
      " true",
      "true ",
      "false",
      "tru",
    ])
      expect(on(env({ [name]: v })), JSON.stringify(v)).toBe(false);
    expect(on(env({ [name]: "true" }))).toBe(true);
  });

  it("each switch reads only its own variable", () => {
    expect(
      analysisSignedOff(env({ ANALYSIS_PATIENT_VIEWS_SIGNED_OFF: "true" })),
    ).toBe(false);
    expect(patientViewsSignedOff(env({ ANALYSIS_SIGNED_OFF: "true" }))).toBe(
      false,
    );
  });

  it("reads the process environment by default", () => {
    const was = process.env.ANALYSIS_SIGNED_OFF;
    try {
      process.env.ANALYSIS_SIGNED_OFF = "true";
      expect(analysisSignedOff()).toBe(true);
      process.env.ANALYSIS_SIGNED_OFF = "yes";
      expect(analysisSignedOff()).toBe(false);
    } finally {
      if (was === undefined) delete process.env.ANALYSIS_SIGNED_OFF;
      else process.env.ANALYSIS_SIGNED_OFF = was;
    }
  });
});
