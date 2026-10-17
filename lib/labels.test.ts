import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_TERMS,
  RESULT_LABEL,
  STAGES,
  citationTag,
  sourceStatus,
  stageIndex,
} from "./labels";

describe("labels", () => {
  it("uses plain language only", () => {
    const shown = [
      ...Object.values(RESULT_LABEL),
      ...STAGES.map((s) => s.label),
      ...(["PASS", "FLAG", "REDACT"] as const).map((a) => citationTag(a).label),
    ].join(" ");
    for (const term of FORBIDDEN_TERMS)
      expect(shown.toLowerCase()).not.toContain(term.toLowerCase());
  });
  it("forbids the correction codes", () => {
    for (const code of [
      "pending_review",
      "self_approval",
      "already_decided",
      "not_supported",
      "needs_rewording",
      "out_of_scope",
    ])
      expect(FORBIDDEN_TERMS).toContain(code);
  });
  it("forbids the two-step codes a staff removal can return", () => {
    for (const code of ["mfa_required", "mfa_invalid", "mfa_locked"])
      expect(FORBIDDEN_TERMS).toContain(code);
  });
  it("lists the six analysing steps in order", () => {
    expect(STAGES.map((s) => s.label)).toEqual([
      "Protecting patient privacy",
      "Searching medical guidelines",
      "Generating clinical assessment",
      "Verifying against evidence",
      "Running safety checks",
      "Finalising recommendation",
    ]);
  });
  it("does not forbid the bare KB term in any label", () => {
    expect(FORBIDDEN_TERMS).toContain("KB");
    expect(FORBIDDEN_TERMS).not.toContain("KB#");
  });
  it("maps citation actions to source statuses", () => {
    expect(sourceStatus("PASS")).toBe("verified");
    expect(sourceStatus("FLAG")).toBe("review");
    expect(sourceStatus("REDACT")).toBe("removed");
  });
  it("maps a stage to its zero-based index, defaulting to the first step", () => {
    expect(stageIndex("pii_masking")).toBe(0);
    expect(stageIndex("generation")).toBe(2);
    expect(stageIndex("decision")).toBe(5);
    expect(stageIndex(null)).toBe(0);
    expect(stageIndex(undefined)).toBe(0);
  });
});
