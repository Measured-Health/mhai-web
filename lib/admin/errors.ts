import { ApiError } from "../api/errors";

export interface AdminError {
  title: string;
  body: string;
  /** The person or item no longer exists (404, or decided elsewhere). */
  gone: boolean;
  /** Someone else changed it; the latest is loading (R7). */
  stale: boolean;
}

const E = (
  title: string,
  body: string,
  extra: Partial<AdminError> = {},
): AdminError => ({ title, body, gone: false, stale: false, ...extra });

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
        "Ask another hospital admin to do this.",
      );
    case "last_admin":
      return E(
        "The hospital needs a hospital admin",
        "Make someone else a hospital admin first.",
      );
    case "already_decided":
      return E(
        "This correction has already been decided",
        "It has left the list.",
        { gone: true },
      );
    case "not_eligible":
      return E(
        "That person can't review this correction",
        "Pick someone from the list.",
      );
    case "domain_not_allowed":
      return E(
        "That email address isn't allowed",
        "Invites only go to your hospital's email addresses.",
      );
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
    case "rate_limited":
      return E("Too many changes at once", "Wait a minute and try again.");
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
