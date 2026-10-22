import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW, makeEvent } from "@/tests/admin";
import { FORBIDDEN_TERMS, RESULT_LABEL, STAGES } from "../labels";
import { ROLE_LABEL, SIGN_IN_LABEL, STAFF_FILTERS, STAFF_STATE } from "./staff";
import {
  ACTIVITY_TYPE_LABEL,
  FLAG_LABEL,
  actorName,
  describeEvent,
  rangeStart,
  typeLabel,
} from "./activity";
import { eventClock } from "../time";

const who = (display_name: string) => ({ display_name });

describe("describeEvent (R9)", () => {
  it("says what happened, in plain words, from structured fields", () => {
    const cases: [Parameters<typeof makeEvent>[0], string][] = [
      [
        {
          kind: "specialty_changed",
          type: "admin",
          target: who("Dr. Mensah"),
          specialty: "Cardiology",
        },
        "Changed Dr. Mensah's specialty to Cardiology",
      ],
      [
        {
          kind: "correction_approved",
          type: "review",
          specialty: "Infectious disease",
        },
        "Approved a correction · Infectious disease",
      ],
      [
        {
          kind: "consultation_run",
          type: "consultation",
          specialty: "Internal Medicine",
          confidence: "caution",
        },
        "Ran a consultation · Internal Medicine · Use with caution",
      ],
      [
        {
          kind: "consultation_run",
          type: "consultation",
          specialty: null,
          confidence: null,
        },
        "Ran a consultation",
      ],
      [
        {
          kind: "signed_in_without_mfa",
          device: "Chrome on Windows",
          flag: "policy",
        },
        "Signed in without two-step (setup pending) · Chrome on Windows",
      ],
      [
        {
          kind: "sign_in_locked",
          type: "security",
          actor: null,
          target: who("Dr. Bello"),
          count: 5,
        },
        "5 failed sign-ins for Dr. Bello · account locked",
      ],
      [
        { kind: "invite_accepted", type: "account" },
        "Accepted invite and finished first sign-in",
      ],
      [
        { kind: "deactivated", type: "admin", target: who("Dr. Eze") },
        "Deactivated Dr. Eze",
      ],
      [
        {
          kind: "invite_cancelled",
          type: "admin",
          target: who("n.ade@havanahospital.org"),
        },
        "Cancelled the invite for n.ade@havanahospital.org",
      ],
      [
        {
          kind: "reviewer_assigned",
          type: "review",
          target: who("Dr. Udo"),
          specialty: "Paediatrics",
        },
        "Asked Dr. Udo to review a correction · Paediatrics",
      ],
      [
        { kind: "settings_changed", type: "admin" },
        "Changed hospital settings",
      ],
      [
        {
          kind: "self_role_change",
          type: "security",
          actor: who("Grace Nwosu"),
          target: who("Grace Nwosu"),
          roles_added: ["clinician"],
          flag: "alert",
        },
        "Gave themselves the Clinician role",
      ],
      [
        {
          kind: "self_role_change",
          type: "security",
          roles_added: ["clinician", "hospital_admin"],
        },
        "Gave themselves the Clinician and Hospital admin roles",
      ],
      [
        {
          kind: "analyst_granted",
          type: "admin",
          actor: who("Dr. Obi"),
          target: who("Dr. Kemi Adeyemi"),
        },
        "Dr. Obi gave Dr. Kemi Adeyemi Analyst access",
      ],
      [
        {
          kind: "analyst_removed",
          type: "admin",
          actor: who("Dr. Obi"),
          target: who("Dr. Kemi Adeyemi"),
        },
        "Dr. Obi removed Analyst access from Dr. Kemi Adeyemi",
      ],
      [
        {
          kind: "analysis_patients_viewed",
          type: "security",
          actor: who("Dr. Kemi Adeyemi"),
          count: 12,
        },
        "Dr. Kemi Adeyemi opened 12 de-identified patients in Analysis",
      ],
      [
        { kind: "self_role_change", type: "security", roles_added: [] },
        "Changed their own roles",
      ],
    ];
    for (const [over, text] of cases)
      expect(describeEvent(makeEvent(over))).toBe(text);
  });

  it("shows an unknown kind generically, never its code", () => {
    expect(
      describeEvent(makeEvent({ kind: "token_rotated_v2", type: "security" })),
    ).toBe("Security activity");
    expect(
      describeEvent(makeEvent({ kind: "x", type: "brand_new" as never })),
    ).toBe("Other activity");
  });

  it("never shows a field the contract doesn't have (privacy)", () => {
    const sneaky = {
      ...makeEvent({
        kind: "consultation_run",
        type: "consultation",
        specialty: "Cardiology",
        confidence: "high",
      }),
      question_text: "54 M chest pain, patient John Smith",
      result: "Unstable angina",
    };
    const text = describeEvent(sneaky);
    expect(text).toBe("Ran a consultation · Cardiology · High confidence");
    expect(text).not.toMatch(/John|angina|chest/);
  });

  it("names who did it, or the system", () => {
    expect(actorName(makeEvent())).toBe("Dr. Okafor");
    expect(actorName(makeEvent({ actor: null }))).toBe("System");
    expect(typeLabel(makeEvent({ type: "sign_in" }))).toBe("Sign-in");
  });
});

describe("time", () => {
  it("starts each range where it should", () => {
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    expect(rangeStart("today", NOW)).toBe(today.toISOString());
    expect(rangeStart("7d", NOW)).toBe(
      new Date(NOW - 7 * 86_400_000).toISOString(),
    );
    expect(rangeStart("12m", NOW)).toBe(
      new Date(NOW - 365 * 86_400_000).toISOString(),
    );
  });
  it("shows today's events as a time and older ones with the date", () => {
    expect(eventClock(new Date(NOW).toISOString(), NOW)).toMatch(
      /^\d{2}:\d{2}$/,
    );
    expect(
      eventClock(new Date(NOW - 3 * 86_400_000).toISOString(), NOW),
    ).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/);
    expect(eventClock("not a date", NOW)).toBe("");
  });
});

const KINDS = [
  "signed_in",
  "signed_in_without_mfa",
  "sign_in_locked",
  "consultation_run",
  "result_agreed",
  "correction_suggested",
  "correction_approved",
  "correction_rejected",
  "correction_withdrawn",
  "invite_sent",
  "invite_cancelled",
  "invite_accepted",
  "roles_changed",
  "specialty_changed",
  "reviewer_changed",
  "deactivated",
  "reactivated",
  "removed",
  "password_reset_sent",
  "mfa_reset",
  "mfa_reminder_sent",
  "settings_changed",
  "reviewers_reminded",
  "reviewer_assigned",
  "policy_breach",
  "self_role_change",
  "analyst_granted",
  "analyst_removed",
  "analysis_patients_viewed",
];

// Same matching rule as the e2e scan: upper-case terms are case-sensitive.
const hits = (text: string) =>
  FORBIDDEN_TERMS.filter((t) =>
    new RegExp(`\\b${t}\\b`, t === t.toUpperCase() ? "" : "i").test(text),
  );

describe("every kind reads as plain words", () => {
  it("gives a sentence with no backend code, for each kind", () => {
    for (const kind of KINDS) {
      const text = describeEvent(
        makeEvent({
          kind,
          target: who("Dr. Eze"),
          specialty: "Cardiology",
          confidence: "high",
          device: "Chrome on Windows",
          count: 3,
        }),
      );
      expect(text.length, kind).toBeGreaterThan(3);
      expect(text, kind).not.toContain(kind);
      expect(text, kind).not.toMatch(/_/);
      expect(hits(text), kind).toEqual([]);
    }
  });

  it("says 'Several' when the failed sign-in count is unknown", () => {
    expect(
      describeEvent(
        makeEvent({ kind: "sign_in_locked", target: who("Dr. Bello") }),
      ),
    ).toBe("Several failed sign-ins for Dr. Bello · account locked");
  });

  it("keeps every visible label free of forbidden terms", () => {
    const shown = [
      ...Object.values(RESULT_LABEL),
      ...STAGES.map((s) => s.label),
      ...Object.values(STAFF_STATE).map((s) => s.label),
      ...STAFF_FILTERS.map((f) => f.label),
      ...Object.values(ROLE_LABEL),
      ...Object.values(SIGN_IN_LABEL),
      ...Object.values(ACTIVITY_TYPE_LABEL),
      ...Object.values(FLAG_LABEL),
    ];
    for (const text of shown) expect(hits(text), text).toEqual([]);
  });
});
