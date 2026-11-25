import { ApiError } from "../api/errors";

export interface AdminError {
  title: string;
  body: string;
  /** The person or item no longer exists (404, or decided elsewhere). */
  gone: boolean;
  /** Someone else changed it; the latest is loading (R7). */
  stale: boolean;
  /** Core doesn't do this yet (501): a calm note, not a failure. */
  unavailable: boolean;
  /**
   * The change was saved but its email didn't go (424 `not_delivered`):
   * close the dialog and say so; never offer to send it again as if
   * nothing happened (core would answer 409).
   */
  saved: boolean;
}

const E = (
  title: string,
  body: string,
  extra: Partial<AdminError> = {},
): AdminError => ({
  title,
  body,
  gone: false,
  stale: false,
  unavailable: false,
  saved: false,
  ...extra,
});

/**
 * What the screens say where MHAI doesn't do something yet (reviewing by
 * specialty, hospital sign-on), and what a 501 `not_implemented` reads as
 * until core 1.33.0 is deployed.
 */
export const NOT_AVAILABLE = "Not available yet";

/** Core has no way to send this email (503 `no_delivery`); nothing happened. */
export const NO_DELIVERY = "MHAI can't send emails yet";

/**
 * The change was saved, but its email didn't go through (424
 * `not_delivered`, core 1.41.0): for example the address has no mailbox.
 */
export const NOT_DELIVERED = "Saved, but the email didn't go through";

/** Plain words for every admin refusal; never a backend code (spec §6). */
export function adminError(e: unknown): AdminError {
  if (!(e instanceof ApiError) || e.status === 0)
    return E("Couldn't reach MHAI", "Check your connection and try again.");
  switch (e.code) {
    case "conflict":
      return E(
        "Someone else changed this just now",
        "We've loaded the latest details. Check them and try again.",
        { stale: true },
      );
    case "not_found":
      return E(
        "This is no longer here",
        "Someone else may have removed it. The list has been refreshed.",
        { gone: true },
      );
    case "self_change":
      return E(
        "You can't change your own access",
        "You can remove your own Clinician or Analyst role, but not give yourself a role or remove your own hospital admin role. Ask another hospital admin.",
      );
    case "last_admin":
      return E(
        "The hospital needs a hospital admin",
        "There must always be one active hospital admin with two-step verification on. Make someone else a hospital admin first.",
      );
    case "already_decided":
      return E(
        "This correction has already been decided",
        "It has left the list.",
        { gone: true },
      );
    case "analysis_off":
      return E(
        "Analysis isn't switched on for your hospital",
        "Measured Health switches Analysis on for a hospital. Until then nobody can be given the Analyst role.",
      );
    case "analyst_cap":
      return E(
        "Your hospital has all the analysts it can have",
        "Remove the Analyst role from someone else first, or ask Measured Health about the limit.",
      );
    case "not_eligible":
      return E(
        "This person can't be an analyst yet",
        "An analyst needs the Clinician role, an active account and two-step verification turned on.",
      );
    case "not_implemented":
      return E(NOT_AVAILABLE, "MHAI can't do this yet. Nothing was changed.", {
        unavailable: true,
      });
    case "mfa_invalid":
      return E(
        "That code didn't work. Try again.",
        "Check the code in your authenticator app.",
      );
    case "mfa_required":
      return E(
        "Turn on two-step verification in Profile & security to use the admin pages.",
        "Then come back and try again.",
      );
    case "mfa_locked":
      return E(
        "Too many tries. Wait 15 minutes, then try again.",
        "This keeps the account safe.",
      );
    case "validation_failed":
      return E(
        "MHAI couldn't accept this change",
        "Reload the page and try again.",
      );
    case "rate_limited":
      return E("Too many changes at once", "Wait a minute and try again.");
    case "no_delivery":
      return E(NO_DELIVERY, "Nothing was changed. Try again later.");
    case "not_delivered":
      return E(
        NOT_DELIVERED,
        "Check the email address. The list has been refreshed.",
        { saved: true },
      );
    case "invalid_token":
      return E(
        "This link no longer works",
        "It has expired, was already used or was replaced by a newer one.",
      );
  }
  if (e.status === 403)
    return E(
      "You can't do this",
      "Your hospital admin access may have changed. Sign out and in again if this keeps happening.",
    );
  if (e.status >= 500)
    return E("MHAI couldn't save this", "Try again in a moment.");
  return E(
    "Something went wrong",
    "Try again. If it keeps happening, contact Measured Health support.",
  );
}

type Override = Partial<Record<string, [title: string, body: string]>>;
const withCopy =
  (o: Override) =>
  (e: unknown): AdminError => {
    const base = adminError(e);
    const hit = e instanceof ApiError ? o[e.code] : undefined;
    return hit ? { ...base, title: hit[0], body: hit[1] } : base;
  };

/** Inviting staff: the hospital's daily limit, and roles only. */
export const inviteError = withCopy({
  rate_limited: [
    "Your hospital has sent all the invites it can today",
    "Try again tomorrow.",
  ],
  not_eligible: [
    "Analyst can't be given in an invite",
    "Invite them as a clinician. You can make them an analyst after they join.",
  ],
  validation_failed: [
    "MHAI couldn't accept these invites",
    "Check the email addresses and roles, then try again.",
  ],
  not_delivered: [
    "The invite was saved, but the email didn't go through",
    "Check the email address. You can resend the invite or remove it.",
  ],
});

const ACCOUNT_COPY = {
  self_change: [
    "You can't do this to your own account",
    "Use Profile & security for your own password and two-step. Ask another hospital admin for anything else.",
  ],
  conflict: [
    "This account has changed",
    "We've loaded the latest details. Check them and try again.",
  ],
  rate_limited: [
    "Too many tries for this person",
    "Wait a while, then try again.",
  ],
} satisfies Override;

/** Password reset, two-step reset, a new invite and removing someone. */
export const accountError = withCopy(ACCOUNT_COPY);

/** A new invite: saved, but its email didn't go through. */
export const resendInviteError = withCopy({
  ...ACCOUNT_COPY,
  not_delivered: [
    "The new invite was saved, but the email didn't go through",
    "Check the email address. You can send a new invite or cancel it.",
  ],
});

/** A password reset: done (they're signed out), but its email didn't go through. */
export const passwordResetError = withCopy({
  ...ACCOUNT_COPY,
  not_delivered: [
    "The password reset was done, but the email didn't go through",
    "They're signed out everywhere. Check their email address, then send the reset again.",
  ],
});

/** A two-step reset: done, but the email telling them didn't go through. */
export const mfaResetError = withCopy({
  ...ACCOUNT_COPY,
  not_delivered: [
    "Two-step was reset, but the email didn't go through",
    "They set up two-step again at their next sign-in. Check their email address.",
  ],
});

/** The two-step setup reminder: once a day per person. */
export const staffReminderError = withCopy({
  rate_limited: [
    "A reminder was already sent today",
    "You can send another one tomorrow.",
  ],
  conflict: [
    "They don't need a reminder now",
    "Their two-step may already be set up. The list has been refreshed.",
  ],
  not_delivered: [
    "The reminder was saved, but the email didn't go through",
    "Check their email address. You can send another reminder tomorrow.",
  ],
});

/** Reminding a correction's reviewers: once an hour per correction. */
export const reviewerReminderError = withCopy({
  rate_limited: [
    "Reviewers were reminded in the last hour",
    "You can remind them again later.",
  ],
  no_recipients: [
    "Nobody can review this correction yet",
    "Make another clinician active in Staff, then try again.",
  ],
  not_delivered: [
    "The reminder was saved, but the email didn't go through",
    "Check the reviewers' email addresses in Staff. You can remind them again in an hour.",
  ],
});

/** Assigning a reviewer. */
export const assignError = withCopy({
  not_eligible: [
    "This person can't review this correction",
    "Pick someone from the list. The person who suggested it can't review it.",
  ],
  validation_failed: [
    "MHAI couldn't accept this change",
    "Pick someone from the list and try again.",
  ],
  not_delivered: [
    "The reviewer was assigned, but the email didn't go through",
    "Check their email address in Staff, or let them know another way.",
  ],
});
