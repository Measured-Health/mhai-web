import { oneBackupCode, readBackupCode } from "../codes";
import { UpstreamError } from "./upstream";

/**
 * Making a new backup code (core's `POST /auth/mfa/recovery-codes`, a
 * step-up): what the BFF routes of both apps check. Everything from the
 * browser and everything back from core is read here, and anything
 * unexpected fails closed.
 */

/** The step-up: the app's 6-digit code, or the current backup code. */
export type RecoveryStepUp = { mfa_code: string } | { backup_code: string };

/** What the route answers with when it refuses. */
export type RecoveryCode =
  | "invalid"
  | "mfa_required"
  | "mfa_invalid"
  | "mfa_locked"
  | "rate_limited"
  | "session_expired"
  | "unavailable";

/** The largest body the route reads; a code needs far less. */
export const RECOVERY_BODY_MAX = 1024;

const DIGITS = /^\d{6}$/;
/** The proxies' Idempotency-Key rule. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;

const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/** A request's JSON body, or null when it is too large or not JSON. */
export async function readSmallJson(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > RECOVERY_BODY_MAX)
    return null;
  const text = await req.text().catch(() => null);
  if (text === null || text.length > RECOVERY_BODY_MAX) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The request's single, well-formed Idempotency-Key, or null. */
export function readRequestKey(headers: Headers): string | null {
  const k = headers.get("idempotency-key");
  // Headers joins repeats with ", ", which the rule refuses.
  return k !== null && IDEMPOTENCY_KEY.test(k) ? k : null;
}

/** Exactly `{mfa_code}` (6 digits) or `{backup_code}` (core's shape). */
export function readRecoveryStepUp(v: unknown): RecoveryStepUp | null {
  if (!plain(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1) return null;
  const [k] = keys;
  const s = v[k!];
  if (typeof s !== "string") return null;
  if (k === "mfa_code" && DIGITS.test(s)) return { mfa_code: s };
  if (k === "backup_code" && readBackupCode(s)) return { backup_code: s };
  return null;
}

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
