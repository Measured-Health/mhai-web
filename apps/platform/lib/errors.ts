import { ApiError } from "@mhai/api-client/errors";

export interface PlatformErrorWords {
  title: string;
  body: string;
  /** Someone else changed it: reload to see the latest. */
  stale: boolean;
  /** It was removed or no longer exists. */
  gone: boolean;
}

const W = (
  title: string,
  body = "",
  extra: Partial<PlatformErrorWords> = {},
): PlatformErrorWords => ({ title, body, stale: false, gone: false, ...extra });

const UNREACHABLE = "Couldn't reach the service. Try again.";

/** Plain words for every platform refusal; never a backend code on screen. */
export function platformError(e: unknown): PlatformErrorWords {
  if (!(e instanceof ApiError) || e.status === 0 || e.code === "network")
    return W(UNREACHABLE);
  switch (e.code) {
    case "conflict":
      return W("Changed by someone else", "Reload to see the latest.", {
        stale: true,
      });
    case "not_found":
      return W("This was removed or no longer exists.", "", { gone: true });
    case "duplicate":
      return W("That short code is already used.");
    case "invalid":
      return W("Check the highlighted fields.");
    case "mfa_invalid":
      return W("That code didn't work. Try again.");
    case "mfa_locked":
      return W("Too many wrong codes. Try again in 15 minutes.");
    case "mfa_required":
      return W("Turn on two-step in Account first.");
    case "same_person":
      return W("A different platform admin must approve this.");
    case "blocked":
      return W("Removal can't go ahead yet.");
    case "last_admin":
      return W("There must always be at least one platform admin.");
    case "own_role":
      return W("You can't change your own role.");
    case "forbidden":
      return W("Your account can only view this.");
  }
  if (e.status >= 500) return W(UNREACHABLE);
  return W("Something went wrong. Try again.");
}
