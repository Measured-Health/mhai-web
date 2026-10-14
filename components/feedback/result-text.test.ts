import { describe, expect, it } from "vitest";
import type { ClinicalResultOut } from "@/lib/api/contract";
import { FIXTURES } from "@/lib/api/fixtures";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { toResultView } from "@/lib/result-view";
import { parseBody } from "../result/parse-body";
import { resultAsText } from "./result-text";

const text = (r: ClinicalResultOut) =>
  resultAsText(toResultView(r), parseBody(r.response_text, r.citations));

describe("resultAsText", () => {
  it("includes diagnosis, confidence, steps with numbered sources and the disclaimer", () => {
    const t = text(FIXTURES.high);
    expect(t).toContain("Unstable angina (ICD-10 I20.0)");
    expect(t).toContain("High confidence");
    expect(t).toMatch(/1\. 12-lead ECG within 10 minutes of arrival \[1\]/);
    expect(t).toContain("[1] AHA 2021 Chest Pain Guideline");
    expect(t).toContain("Decision support only.");
  });
  it("carries the review banner on a needs-review result and no confidence", () => {
    const t = text(FIXTURES.review);
    expect(t).toContain("NEEDS CLINICIAN REVIEW");
    expect(t).not.toContain("confidence");
    expect(t).toContain("[removed by safety checks]");
  });
  it("shows no confidence line when the score is null, and no ICD line without a code", () => {
    const t = text({ ...FIXTURES.high, trust_score: null, icd10_code: null });
    expect(t).not.toContain("High confidence");
    expect(t).not.toContain("ICD-10");
  });
  it("mentions consistent reasoning only when stability exists", () => {
    expect(text(FIXTURES.high)).not.toContain("consistent reasoning");
    const withStability: ClinicalResultOut = {
      ...FIXTURES.high,
      guardrail_details: {
        ...FIXTURES.high.guardrail_details,
        l2_entropy: { stability: 0.9 },
      },
    };
    expect(text(withStability)).toContain("consistent reasoning");
  });
  it.each(Object.entries(FIXTURES))("uses no forbidden words (%s)", (_k, r) => {
    const t = text(r);
    for (const term of FORBIDDEN_TERMS)
      expect(t).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
  });
});
