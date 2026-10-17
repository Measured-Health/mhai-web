import { describe, expect, it } from "vitest";
import { ADMIN_NOW as NOW, makeEvent } from "@/tests/admin";
import {
  actorName,
  describeEvent,
  eventClock,
  rangeStart,
  typeLabel,
} from "./activity";

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
