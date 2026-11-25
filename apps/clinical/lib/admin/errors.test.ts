import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { FORBIDDEN_TERMS } from "../labels";
import {
  accountError,
  adminError,
  assignError,
  inviteError,
  mfaResetError,
  passwordResetError,
  resendInviteError,
  reviewerReminderError,
  staffReminderError,
  type AdminError,
} from "./errors";

describe("adminError", () => {
  it("maps each refusal to plain words", () => {
    expect(adminError(new ApiError(403, "self_change"))).toMatchObject({
      title: "You can't change your own access",
      gone: false,
      stale: false,
    });
    expect(adminError(new ApiError(409, "last_admin")).title).toBe(
      "The hospital needs a hospital admin",
    );
    expect(adminError(new ApiError(409, "conflict"))).toMatchObject({
      title: "Someone else changed this just now",
      stale: true,
    });
    expect(adminError(new ApiError(404, "not_found"))).toMatchObject({
      gone: true,
    });
    expect(adminError(new ApiError(409, "already_decided"))).toMatchObject({
      title: "This correction has already been decided",
      gone: true,
    });
    expect(adminError(new ApiError(0, "network")).title).toBe(
      "Couldn't reach MHAI",
    );
    expect(adminError(new Error("boom")).title).toBe("Couldn't reach MHAI");
    expect(adminError(new ApiError(503, "error")).title).toBe(
      "MHAI couldn't save this",
    );
    expect(adminError(new ApiError(403, "forbidden")).title).toBe(
      "You can't do this",
    );
  });

  it("words the two-step refusals plainly", () => {
    expect(adminError(new ApiError(403, "mfa_invalid"))).toMatchObject({
      title: "That code didn't work. Try again.",
      body: "Check the code in your authenticator app.",
      gone: false,
      stale: false,
    });
    expect(adminError(new ApiError(403, "mfa_required"))).toMatchObject({
      title:
        "Turn on two-step verification in Profile & security to use the admin pages.",
      body: "Then come back and try again.",
    });
    expect(adminError(new ApiError(429, "mfa_locked"))).toMatchObject({
      title: "Too many tries. Wait 15 minutes, then try again.",
      body: "This keeps the account safe.",
    });
  });

  it("words core's new staff refusals (1.24.0), and 501 as a calm not available yet", () => {
    expect(adminError(new ApiError(409, "analysis_off")).title).toBe(
      "Analysis isn't switched on for your hospital",
    );
    expect(adminError(new ApiError(409, "analyst_cap")).title).toBe(
      "Your hospital has all the analysts it can have",
    );
    expect(adminError(new ApiError(422, "not_eligible")).body).toMatch(
      /Clinician role, an active account and two-step/,
    );
    expect(adminError(new ApiError(403, "self_change")).body).toMatch(
      /not give yourself a role/,
    );
    expect(adminError(new ApiError(501, "not_implemented"))).toMatchObject({
      title: "Not available yet",
      unavailable: true,
      gone: false,
      stale: false,
    });
  });

  it("never shows a backend term", () => {
    const codes = [
      "self_change",
      "last_admin",
      "conflict",
      "not_found",
      "already_decided",
      "not_eligible",
      "analysis_off",
      "analyst_cap",
      "not_implemented",
      "validation_failed",
      "rate_limited",
      "forbidden",
      "mfa_required",
      "mfa_invalid",
      "mfa_locked",
      "invalid",
      "no_delivery",
      "not_delivered",
      "invalid_token",
      "no_recipients",
      "weird_new_code",
    ];
    for (const read of [
      adminError,
      inviteError,
      accountError,
      resendInviteError,
      passwordResetError,
      mfaResetError,
      staffReminderError,
      reviewerReminderError,
      assignError,
    ])
      for (const c of codes) {
        const { title, body } = read(new ApiError(409, c));
        for (const t of FORBIDDEN_TERMS)
          expect(`${title} ${body}`).not.toContain(t);
        expect(`${title} ${body}`).not.toContain("_");
        expect(`${title} ${body}`).not.toMatch(/email provider|token|503|410/i);
      }
  });

  it("says plainly when MHAI can't send an email, or a link no longer works", () => {
    expect(adminError(new ApiError(503, "no_delivery"))).toMatchObject({
      title: "MHAI can't send emails yet",
      body: "Nothing was changed. Try again later.",
      stale: false,
      gone: false,
    });
    expect(adminError(new ApiError(410, "invalid_token")).title).toBe(
      "This link no longer works",
    );
  });

  it("never says nothing was changed when the change was saved but its email didn't go", () => {
    const e = new ApiError(424, "not_delivered");
    expect(adminError(e)).toMatchObject({
      title: "Saved, but the email didn't go through",
      body: "Check the email address. The list has been refreshed.",
      saved: true,
      stale: false,
      gone: false,
    });
    const words: [(e: unknown) => AdminError, string, string][] = [
      [
        inviteError,
        "The invite was saved, but the email didn't go through",
        "Check the email address. You can resend the invite or remove it.",
      ],
      [
        resendInviteError,
        "The new invite was saved, but the email didn't go through",
        "Check the email address. You can send a new invite or cancel it.",
      ],
      [
        passwordResetError,
        "The password reset was done, but the email didn't go through",
        "They're signed out everywhere. Check their email address, then send the reset again.",
      ],
      [
        mfaResetError,
        "Two-step was reset, but the email didn't go through",
        "They set up two-step again at their next sign-in. Check their email address.",
      ],
      [
        staffReminderError,
        "The reminder was saved, but the email didn't go through",
        "Check their email address. You can send another reminder tomorrow.",
      ],
      [
        reviewerReminderError,
        "The reminder was saved, but the email didn't go through",
        "Check the reviewers' email addresses in Staff. You can remind them again in an hour.",
      ],
      [
        assignError,
        "The reviewer was assigned, but the email didn't go through",
        "Check their email address in Staff, or let them know another way.",
      ],
    ];
    for (const [read, title, body] of words) {
      const got = read(e);
      expect(got).toMatchObject({ title, body, saved: true });
      expect(`${got.title} ${got.body}`).not.toMatch(
        /Nothing was changed|can't send emails|try again later/i,
      );
    }
    // The real no-sender case keeps its words, and is not "saved".
    expect(resendInviteError(new ApiError(503, "no_delivery"))).toMatchObject({
      title: "MHAI can't send emails yet",
      saved: false,
    });
    // The other actions' own words are kept.
    expect(passwordResetError(new ApiError(429, "rate_limited")).title).toBe(
      "Too many tries for this person",
    );
  });

  it("words each action's own limits and refusals", () => {
    expect(inviteError(new ApiError(429, "rate_limited")).title).toBe(
      "Your hospital has sent all the invites it can today",
    );
    expect(inviteError(new ApiError(422, "not_eligible")).title).toBe(
      "Analyst can't be given in an invite",
    );
    expect(staffReminderError(new ApiError(429, "rate_limited")).title).toBe(
      "A reminder was already sent today",
    );
    expect(reviewerReminderError(new ApiError(429, "rate_limited")).title).toBe(
      "Reviewers were reminded in the last hour",
    );
    expect(
      reviewerReminderError(new ApiError(422, "no_recipients")).title,
    ).toBe("Nobody can review this correction yet");
    expect(assignError(new ApiError(422, "not_eligible")).title).toBe(
      "This person can't review this correction",
    );
    expect(accountError(new ApiError(403, "self_change")).title).toBe(
      "You can't do this to your own account",
    );
    // The flags come from the shared reading.
    expect(accountError(new ApiError(409, "conflict")).stale).toBe(true);
    expect(
      reviewerReminderError(new ApiError(409, "already_decided")).gone,
    ).toBe(true);
    expect(inviteError(new ApiError(501, "not_implemented"))).toMatchObject({
      title: "Not available yet",
      unavailable: true,
    });
  });
});
