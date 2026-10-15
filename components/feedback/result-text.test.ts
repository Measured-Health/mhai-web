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
    expect(t).toMatch(/needs clinician review/i);
    expect(t).not.toContain("confidence");
    expect(t).toContain("[removed by safety checks]");
  });
  it("uses the screen's banner copy: neutral for degraded, evidence-failure for escalated", () => {
    const d = text({ ...FIXTURES.high, degraded: true });
    expect(d).toContain(
      "Checks ran in a reduced mode, so this answer needs clinician review before use.",
    );
    expect(d).not.toMatch(/evidence didn't support/);
    expect(text(FIXTURES.review)).toContain(
      "The evidence didn't support enough of this answer",
    );
  });
  it("keeps the review eyebrow and the reduced-accuracy notice", () => {
    const t = text(FIXTURES.review);
    expect(t).toContain("Possible assessment · not verified");
    expect(t).toContain(
      "Reduced-accuracy mode: Evidence checking is running in reduced-accuracy mode.",
    );
    const h = text(FIXTURES.high);
    expect(h).not.toContain("Possible assessment");
    expect(h).not.toContain("Reduced-accuracy mode");
  });
  it("prints 'Use with caution' once on a caution result", () => {
    const t = text(FIXTURES.caution);
    expect(t.match(/Use with caution/g)).toHaveLength(1);
  });
  it("keeps the caution banner when the score is null", () => {
    const t = text({ ...FIXTURES.caution, trust_score: null });
    expect(t).toContain("Use with caution");
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
