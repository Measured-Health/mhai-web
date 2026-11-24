import { oneBackupCode } from "../codes";
import { UpstreamError } from "./upstream";

/**
 * Making a new backup code (core's `POST /auth/mfa/recovery-codes`, a
 * step-up). The request is read with the step-up readers in
 * `./mfa-replace` (`readCappedJson`, `readIdempotencyKey`,
 * `readStepUpBody`); core's reply and refusals are read here, and anything
 * unexpected fails closed.
 */

/** What the route answers with when it refuses. */
export type RecoveryCode =
  | "invalid"
  | "mfa_required"
  | "mfa_invalid"
  | "mfa_locked"
  | "rate_limited"
  | "session_expired"
  | "unavailable";

const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/** Core's reply: exactly `{recovery_codes: [one code]}`, else null. */
export function readRecoveryReply(v: unknown): string | null {
  if (!plain(v)) return null;
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0] === "recovery_codes"
    ? oneBackupCode(v.recovery_codes)
    : null;
}

/** Core's refusal as the browser may see it: the code only, from a fixed list. */
export function recoveryRefusal(e: unknown): {
  status: number;
  code: RecoveryCode;
} {
  if (!(e instanceof UpstreamError))
    return { status: 503, code: "unavailable" };
  switch (e.code) {
    case "unauthenticated":
    case "token_expired":
      return { status: 401, code: "session_expired" };
    case "mfa_required":
    case "conflict":
      return { status: 403, code: "mfa_required" };
    case "mfa_invalid":
      return { status: 403, code: "mfa_invalid" };
    case "mfa_locked":
      return { status: 429, code: "mfa_locked" };
    case "rate_limited":
      return { status: 429, code: "rate_limited" };
    case "invalid":
    case "validation_failed":
      return { status: 422, code: "invalid" };
  }
  if (e.status === 401) return { status: 401, code: "session_expired" };
  return { status: 503, code: "unavailable" };
}
