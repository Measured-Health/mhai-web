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
  ...extra,
});

/** What the screens say where core answers 501 `not_implemented`. */
export const NOT_AVAILABLE = "Not available yet";

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
