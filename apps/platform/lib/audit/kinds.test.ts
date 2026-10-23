import { describe, expect, it } from "vitest";
import type { ActivityAction } from "@/lib/api/contract";
import { AUDIT_TYPES } from "@/lib/api/audit-contract";
import { auditEvent } from "@/tests/audit-event";
import { REJECT_LABEL, REVOKE_LABEL, STATUS_LABEL } from "@mhai/ui/clearances";
import {
  KINDS,
  LETTER_STATUS_WORDS,
  LOCATION_WORDS,
  REASON_WORDS,
  TYPE_WORDS,
  VIEW_WORDS,
  locationWords,
  viewWords,
} from "./kinds";

describe("the audit kinds", () => {
  it("every kind maps to one of the 14 types", () => {
    expect(AUDIT_TYPES).toHaveLength(14);
    expect(Object.keys(TYPE_WORDS).sort()).toEqual([...AUDIT_TYPES].sort());
    for (const [kind, k] of Object.entries(KINDS)) {
      expect(AUDIT_TYPES, kind).toContain(k.type);
      expect(kind).toMatch(/^[a-z][a-z_]{0,39}$/);
    }
    // Every type has at least one kind; named kinds list a target.
    const used = new Set(Object.values(KINDS).map((k) => k.type));
    expect([...used].sort()).toEqual([...AUDIT_TYPES].sort());
    for (const [kind, k] of Object.entries(KINDS))
      if (k.named) expect(k.targets.length, kind).toBeGreaterThan(0);
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
      facts: { patient_count: 12, view: "findings" },
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
        facts: { searched: { kind: "patient_id" }, searched_kind: "pseudonym" },
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
      KINDS.export_download_refused.words({
        ...base,
        type: "export",
        kind: "export_download_refused",
        outcome: "refused",
        reason: "not_owner",
        refs: { clearance_id: null, export_id: "exp_7", request_id: null },
      }),
    ).toBe("Tried to download export exp_7, made by someone else");
    expect(
      KINDS.retention_run.words({
        ...base,
        type: "retention",
        kind: "retention_run",
        facts: { purged_count: 412_006, before: "2021-01-03T12:00:00Z" },
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
        "not_owner",
        // Plan 11: rejecting, revoking and narrowing a letter.
        "wrong_people",
        "end_date_mismatch",
        "not_leadership",
        "unreadable",
        "no_longer_needed",
        "person_left",
        "uploaded_in_error",
        // A refused file.
        "file_type",
        "file_too_large",
        "too_many_pages",
        "password_protected",
        "failed_safety_check",
        // A verify refused because the letter names them.
        "same_person",
      ].sort(),
    );
  });
});

describe("Plan 11's audit words", () => {
  it("every reject and revoke reason has words, the same as the screens'", () => {
    for (const [code, words] of Object.entries(REJECT_LABEL))
      if (code !== "other") expect(REASON_WORDS[code], code).toBe(words);
    for (const [code, words] of Object.entries(REVOKE_LABEL))
      expect(REASON_WORDS[code], code).toBe(words);
  });

  it("the letter status words are the shared ones", () => {
    expect(LETTER_STATUS_WORDS).toEqual(STATUS_LABEL);
    expect(LETTER_STATUS_WORDS.waiting).toBe("Waiting for Measured Health");
  });

  it("one name per event: the audit kinds are the Activity actions' names", () => {
    for (const old of [
      "letter_uploaded",
      "letter_refused",
      "letter_verified",
      "letter_rejected",
      "letter_narrowed",
      "letter_revoked",
      "letter_ended",
      "letter_viewed",
      "letter_reminder_sent",
      "verify_refused",
      "named_switch_changed",
      "named_switch_requested",
      "named_switch_approved",
      "named_switch_cancelled",
    ])
      expect(KINDS[old], old).toBeUndefined();
    for (const kind of [
      "clearance_uploaded",
      "clearance_refused",
      "clearance_verified",
      "clearance_rejected",
      "clearance_narrowed",
      "clearance_revoked",
      "clearance_ended",
      "clearance_viewed",
      "clearance_reminder_sent",
      "clearance_verify_refused",
    ]) {
      expect(KINDS[kind]!.type, kind).toBe("named_access");
      expect(KINDS[kind]!.targets, kind).toEqual(["clearance"]);
    }
    for (const kind of [
      "named_access_requested",
      "named_access_approved",
      "named_access_cancelled",
      "named_access_lowered",
    ]) {
      expect(KINDS[kind]!.type, kind).toBe("named_access");
      expect(KINDS[kind]!.targets, kind).toEqual(["setting"]);
    }
    const e = auditEvent({
      type: "named_access",
      kind: "clearance_verified",
      target: { kind: "clearance", id: "cl_northgate_2026" },
      reason: null,
    });
    expect(KINDS.clearance_verified!.words(e)).toBe(
      "Verified clearance letter cl_northgate_2026",
    );
    const s = auditEvent({
      type: "named_access",
      kind: "named_access_requested",
      target: {
        kind: "setting",
        id: "named_access",
        name: "On for Havana Hospital",
      },
      reason: null,
    });
    expect(KINDS.named_access_requested!.words(s)).toBe(
      "Asked to turn named access to On for Havana Hospital",
    );
    expect(
      KINDS.named_access_lowered!.words({
        ...s,
        kind: "named_access_lowered",
        target: null,
      }),
    ).toBe("Turned the named access switch down");
  });

  it("a verify refusal is one kind with a reason: same_side or same_person", () => {
    const e = auditEvent({
      type: "named_access",
      kind: "clearance_verify_refused",
      outcome: "refused",
      target: { kind: "clearance", id: "cl_wait" },
      reason: "same_side",
    });
    expect(KINDS.clearance_verify_refused!.words(e)).toBe(
      "Couldn't verify clearance letter cl_wait: they're linked to the hospital",
    );
    expect(
      KINDS.clearance_verify_refused!.words({ ...e, reason: "same_person" }),
    ).toBe("Couldn't verify clearance letter cl_wait: the letter names them");
    expect(REASON_WORDS.same_side).toBe("Linked to the hospital");
    expect(REASON_WORDS.same_person).toBe("The letter names them");
    expect(REASON_WORDS.covers_you).toBeUndefined();
  });

  it("views are Plan 6's, and locations admitted, outpatient and emergency", () => {
    expect(Object.keys(VIEW_WORDS)).toEqual([
      "prevalence",
      "affected",
      "co-occurring",
      "findings",
      "quality",
    ]);
    expect(viewWords("co-occurring")).toBe("Co-occurring conditions");
    expect(viewWords("abnormal_results")).toBe("a patient list");
    expect(Object.keys(LOCATION_WORDS)).toEqual([
      "admitted",
      "outpatient",
      "emergency",
    ]);
    expect(locationWords("admitted")).toBe("Admitted");
    expect(locationWords("inpatient")).toBe("another setting");
  });
});

describe("Plan 8's Activity actions", () => {
  it("holds sit under retention; jobs and settings under platform", () => {
    for (const kind of [
      "hold_placed",
      "hold_edited",
      "hold_lift_requested",
      "hold_lift_cancelled",
      "hold_lift_lapsed",
      "hold_lifted",
      "hold_lift_undone",
      "hold_released",
    ]) {
      expect(KINDS[kind].type, kind).toBe("retention");
      expect(KINDS[kind].targets, kind).toEqual(["hold", "hospital"]);
    }
    for (const kind of [
      "jobs_retried",
      "jobs_cancelled",
      "retention_changed",
      "setting_change_requested",
      "setting_change_approved",
      "setting_change_cancelled",
      "setting_change_lapsed",
      "clean_up_paused",
      "clean_up_resumed",
      "triage_switched_off",
      "feedback_buffer_cleared",
    ])
      expect(KINDS[kind].type, kind).toBe("platform");
    expect(KINDS.setting_change_requested.targets).toEqual(["setting"]);
    expect(KINDS.jobs_retried.targets).toEqual([]);
  });

  it("no hold kind accepts a note", () => {
    const holds = Object.keys(KINDS).filter((k) => k.startsWith("hold_"));
    expect(holds).toHaveLength(8);
    for (const kind of holds) expect(KINDS[kind].note, kind).toBe(false);
  });

  it("every Activity action has a kind, so its audit entry can be shown", () => {
    // A Record, so a new ActivityAction fails typecheck until it is listed.
    const ACTIONS: Record<ActivityAction, true> = {
      hospital_added: true,
      hospital_updated: true,
      hospital_deactivated: true,
      hospital_reactivated: true,
      removal_requested: true,
      removal_blocked: true,
      removal_approved: true,
      removal_cancelled: true,
      hospital_removed: true,
      sso_updated: true,
      sso_tested: true,
      admin_invited: true,
      admin_invite_resent: true,
      team_invited: true,
      team_role_changed: true,
      team_removed: true,
      change_followed_up: true,
      change_note_edited: true,
      change_follow_up_undone: true,
      hold_placed: true,
      hold_edited: true,
      hold_lift_requested: true,
      hold_lift_cancelled: true,
      hold_lift_lapsed: true,
      hold_lifted: true,
      hold_lift_undone: true,
      hold_released: true,
      jobs_retried: true,
      jobs_cancelled: true,
      retention_changed: true,
      setting_change_requested: true,
      setting_change_approved: true,
      setting_change_cancelled: true,
      setting_change_lapsed: true,
      clean_up_paused: true,
      clean_up_resumed: true,
      triage_switched_off: true,
      feedback_buffer_cleared: true,
      emr_connection_added: true,
      emr_connection_changed: true,
      emr_connection_switched_on: true,
      emr_connection_switched_off: true,
      emr_connection_tested: true,
      clearance_viewed: true,
      clearance_verified: true,
      clearance_rejected: true,
      clearance_revoked: true,
      clearance_verify_refused: true,
      named_access_requested: true,
      named_access_approved: true,
      named_access_cancelled: true,
      named_access_lowered: true,
      analysis_switched: true,
      patient_views_switched: true,
    };
    for (const action of Object.keys(ACTIONS))
      expect(KINDS[action], action).toBeDefined();
  });

  it("the two Analysis switches are Platform kinds with no target and no note, and say which way", () => {
    for (const [kind, on, off] of [
      ["analysis_switched", "Turned Analysis on", "Turned Analysis off"],
      [
        "patient_views_switched",
        "Turned patient lists in Analysis on",
        "Turned patient lists in Analysis off",
      ],
    ] as const) {
      expect(KINDS[kind].type, kind).toBe("platform");
      expect(KINDS[kind].note, kind).toBe(false);
      expect(KINDS[kind].targets, kind).toEqual([]);
      const e = (switched?: "on" | "off") =>
        auditEvent({
          type: "platform",
          kind,
          target: null,
          facts: switched ? { switched } : {},
        });
      expect(KINDS[kind].words(e("on"))).toBe(on);
      expect(KINDS[kind].words(e("off"))).toBe(off);
      expect(KINDS[kind].words(e())).toMatch(/on or off$/);
    }
  });

  it("the settings actions are Platform kinds, with a setting target and no note", () => {
    for (const kind of [
      "retention_changed",
      "setting_change_requested",
      "setting_change_approved",
      "setting_change_cancelled",
      "setting_change_lapsed",
    ]) {
      expect(KINDS[kind].type, kind).toBe("platform");
      expect(KINDS[kind].note, kind).toBe(false);
      expect(KINDS[kind].targets, kind).toEqual(["setting"]);
    }
    for (const kind of [
      "clean_up_paused",
      "clean_up_resumed",
      "triage_switched_off",
      "feedback_buffer_cleared",
    ]) {
      expect(KINDS[kind].type, kind).toBe("platform");
      expect(KINDS[kind].note, kind).toBe(false);
      expect(KINDS[kind].targets, kind).toEqual([]);
    }
  });
});

describe("Plan 13's record connection and alert settings kinds", () => {
  const EMR = {
    emr_connection_added: "Added the record connection",
    emr_connection_changed: "Changed the record connection",
    emr_connection_switched_on: "Switched on the record connection",
    emr_connection_switched_off: "Switched off the record connection",
    emr_connection_tested: "Tested the record connection",
  };

  it("the record connection kinds name the connection and the hospital", () => {
    const e = auditEvent({
      type: "hospital_settings",
      reason: null,
      hospital: { id: "h_havana", name: "Havana Hospital", removed: false },
      target: { kind: "connection", id: "emr_hv1", name: "Main record" },
    });
    for (const [kind, start] of Object.entries(EMR)) {
      const k = KINDS[kind];
      expect(k.type, kind).toBe("hospital_settings");
      expect(k.targets, kind).toEqual(["connection"]);
      expect(k.named, kind).toBe(true);
      expect(k.note, kind).toBe(false);
      expect(k.words({ ...e, kind }), kind).toBe(
        `${start} “Main record” for Havana Hospital`,
      );
      expect(k.words({ ...e, kind, target: null }), kind).toBe(
        `${start} for Havana Hospital`,
      );
      expect(k.words({ ...e, kind, target: null, hospital: null }), kind).toBe(
        `${start} for a hospital`,
      );
    }
  });

  it("the alert settings kinds are Alerts kinds with no target", () => {
    const words = {
      alert_units_changed: "Changed which units alerts cover",
      alert_rules_changed: "Changed what alerts flag",
      alert_recipients_changed: "Changed who gets alerts",
    };
    const e = auditEvent({ type: "alerts", target: null, reason: null });
    for (const [kind, text] of Object.entries(words)) {
      const k = KINDS[kind];
      expect(k.type, kind).toBe("alerts");
      expect(k.targets, kind).toEqual([]);
      expect(k.note, kind).toBe(false);
      expect(k.words({ ...e, kind }), kind).toBe(text);
    }
  });
});
