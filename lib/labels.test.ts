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
  it("forbids the alert and notification codes", () => {
    for (const code of [
      "already_handled",
      "not_relevant",
      "already_known",
      "wrong_patient",
      "not_recorded",
      "alert_popups",
      "correction_popups",
      "emr_link",
      "source_label",
      "code_system",
      "invalid_reason",
      "note_too_long",
      "invalid_cursor",
    ])
      expect(FORBIDDEN_TERMS).toContain(code);
  });
  it("forbids the usage alert codes (F9)", () => {
    for (const code of [
      "critical_target_minutes",
      "critical_within_target",
      "median_ack_minutes",
      // Whole-word checks don't match the longer code inside this one.
      "median_ack_minutes_critical",
      "usual_multiple",
      "has_previous",
      "suppressed",
      "acknowledged_share",
      "dismissed_share",
      "dismiss_reasons",
      "top_findings",
      "top_locations",
    ])
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
  it("forbids the hospital admin codes on screen", () => {
    for (const t of [
      "self_change",
      "last_admin",
      "not_eligible",
      "domain_not_allowed",
      "already_staff",
      "invalid_email",
      "mfa_not_set_up",
      "invite_expired",
      "hospital_admin",
      "password_mfa",
      "mfa_required",
      "mfa_invalid",
      "mfa_locked",
      "self_role_change",
    ])
      expect(FORBIDDEN_TERMS).toContain(t);
  });
});
