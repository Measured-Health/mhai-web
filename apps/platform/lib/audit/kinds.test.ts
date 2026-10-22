import { describe, expect, it } from "vitest";
import { AUDIT_TYPES } from "@/lib/api/audit-contract";
import { auditEvent } from "@/tests/audit-event";
import { KINDS, REASON_WORDS, TYPE_WORDS } from "./kinds";

describe("the audit kinds", () => {
  it("every kind maps to one of the 14 types", () => {
    expect(AUDIT_TYPES).toHaveLength(14);
    expect(Object.keys(TYPE_WORDS).sort()).toEqual([...AUDIT_TYPES].sort());
    for (const [kind, k] of Object.entries(KINDS)) {
      expect(AUDIT_TYPES, kind).toContain(k.type);
      expect(kind).toMatch(/^[a-z][a-z_]{0,39}$/);
    }
    // Every type has at least one kind.
    const used = new Set(Object.values(KINDS).map((k) => k.type));
    expect([...used].sort()).toEqual([...AUDIT_TYPES].sort());
  });

  it("has the kinds main's Activity already records", () => {
    for (const kind of [
      "change_note_edited",
      "removal_blocked",
      "admin_invited",
      "admin_invite_resent",
    ])
      expect(KINDS[kind], kind).toBeDefined();
    expect(KINDS.change_note_edited.type).toBe("platform");
    expect(KINDS.change_note_edited.note).toBe(true);
    expect(KINDS.removal_blocked.type).toBe("hospital_settings");
  });

  it("Deactivated Northgate General Hospital", () => {
    expect(KINDS.hospital_deactivated.words(auditEvent())).toBe(
      "Deactivated Northgate General Hospital",
    );
    expect(KINDS.hospital_deactivated.note).toBe(true);
  });

  it("Opened a named patient list · 12 patients", () => {
    const e = auditEvent({
      type: "named_access",
      kind: "drilldown_named",
      target: null,
      reason: "clinical_follow_up",
      facts: { patient_count: 12, view: "abnormal_results" },
    });
    expect(KINDS.drilldown_named.words(e)).toBe(
      "Opened a named patient list · 12 patients",
    );
    expect(
      KINDS.drilldown_named.words({ ...e, facts: { patient_count: 1 } }),
    ).toBe("Opened a named patient list · 1 patient");
  });

  it("Asked a question · Cardiology · Medium confidence", () => {
    const e = auditEvent({
      type: "consultation",
      kind: "question_asked",
      target: null,
      reason: null,
      facts: { specialty: "cardiology", confidence: "medium" },
    });
    expect(KINDS.question_asked.words(e)).toBe(
      "Asked a question · Cardiology · Medium confidence",
    );
    expect(
      KINDS.answer_sent_for_review.words({
        ...e,
        kind: "answer_sent_for_review",
        facts: { specialty: "emergency_medicine" },
      }),
    ).toBe("Answer sent for review · Emergency medicine");
  });

  it("a system check run reads Daily integrity check", () => {
    const e = auditEvent({
      type: "audit",
      kind: "audit_check_run",
      actor: { id: "system", name: "System", role: "system", kind: "system" },
      hospital: null,
      target: { kind: "run", id: "run_1" },
      reason: null,
    });
    expect(KINDS.audit_check_run.words(e)).toBe("Daily integrity check");
    expect(
      KINDS.audit_check_run.words({
        ...e,
        actor: {
          id: "u_ada",
          name: "Ada Bakare",
          role: "platform_admin",
          kind: "platform",
        },
      }),
    ).toBe("Ran the integrity check");
  });

  it("names a target, and falls back to plain words without one", () => {
    const staff = auditEvent({
      type: "staff",
      kind: "staff_role_changed",
      target: { kind: "staff", id: "s_1", name: "Dr N. Eze" },
      reason: null,
    });
    expect(KINDS.staff_role_changed.words(staff)).toBe(
      "Changed Dr N. Eze's role",
    );
    expect(
      KINDS.admin_invited.words({
        ...staff,
        type: "hospital_settings",
        kind: "admin_invited",
        target: null,
      }),
    ).toBe("Invited the first hospital admin");
    expect(
      KINDS.change_note_edited.words({
        ...staff,
        type: "platform",
        kind: "change_note_edited",
        target: { kind: "change", id: "c_1", name: "Fewer answers reviewed" },
      }),
    ).toBe("Edited the follow-up note on “Fewer answers reviewed”");
  });

  it("puts searches, exports and retention in words", () => {
    const base = auditEvent({ target: null, reason: null, hospital: null });
    expect(
      KINDS.audit_searched.words({
        ...base,
        type: "audit",
        kind: "audit_searched",
        facts: { searched: "p_ng_7f3a2c", searched_kind: "pseudonym" },
      }),
    ).toBe("Searched the audit log by patient id");
    expect(
      KINDS.audit_exported.words({
        ...base,
        type: "export",
        kind: "audit_exported",
        facts: { rows: 1284 },
      }),
    ).toBe("Exported the audit log · 1,284 rows");
    expect(
      KINDS.export_download_refused.words({
        ...base,
        type: "export",
        kind: "export_download_refused",
        refs: { clearance_id: null, export_id: "exp_7", request_id: null },
      }),
    ).toBe("Tried to download export exp_7 again");
    expect(
      KINDS.retention_run.words({
        ...base,
        type: "retention",
        kind: "retention_run",
        facts: { purged_count: 412_006, before: "2021-01-03T12:00:00" },
      }),
    ).toBe("Retention removed 412,006 entries before 3 Jan 2021");
    expect(
      KINDS.re_anchor.words({
        ...base,
        type: "retention",
        kind: "re_anchor",
        facts: { incident_ref: "INC-0042" },
      }),
    ).toBe("Re-anchored the log after incident INC-0042");
  });

  it("has the closed list of reasons", () => {
    expect(Object.keys(REASON_WORDS).sort()).toEqual(
      [
        "contract_ended",
        "security_concern",
        "hospital_request",
        "other",
        "legal_request",
        "regulator_request",
        "internal_review",
        "security_investigation",
        "clinical_follow_up",
        "quality_improvement",
        "audit",
        "wrong_role",
        "wrong_code",
        "locked",
        "not_covered",
        "same_side",
        "gone",
      ].sort(),
    );
  });
});
