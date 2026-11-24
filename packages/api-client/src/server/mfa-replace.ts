import { readBackupCode } from "../codes";
import { UpstreamError } from "./upstream";

/**
 * Moving two-step to a new authenticator app (core's
 * `POST /auth/mfa/replace` and `POST /auth/mfa/replace/confirm`): what the
 * BFF routes of both apps check. Everything from the browser and everything
 * back from core is read here, and anything unexpected fails closed.
 */

/** A step-up: the current app's 6-digit code, or one backup code. */
export type StepUpBody = { mfa_code: string } | { backup_code: string };

/** The new app's key, as the browser gets it (memory only, never logged). */
export interface ReplaceSetup {
  otpauthUri: string;
  /** The same secret as text, for "Can't scan? Show key". */
  secret: string;
}

/** What the routes answer with when they refuse. */
export type ReplaceCode =
  | "invalid"
  | "mfa_required"
  | "mfa_invalid"
  | "mfa_locked"
  | "rate_limited"
  | "conflict"
  | "session_expired"
  | "unavailable";

/** The largest body either route reads; a code needs far less. */
export const REPLACE_BODY_MAX = 1024;

const DIGITS = /^\d{6}$/;
/** The proxies' Idempotency-Key rule. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{1,64}$/;

const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/** The only key of `v`, or null when it has none or more than one. */
const onlyKey = (v: Record<string, unknown>): string | null => {
  const keys = Object.keys(v);
  return keys.length === 1 ? keys[0]! : null;
};

/** A request's JSON body, or null when it is too large or not JSON. */
export async function readCappedJson(req: Request): Promise<unknown> {
  // A declared size over the cap is refused without reading the body.
  if (Number(req.headers.get("content-length") ?? 0) > REPLACE_BODY_MAX)
    return null;
  const text = await req.text().catch(() => null);
  if (text === null || text.length > REPLACE_BODY_MAX) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The request's single, well-formed Idempotency-Key, or null. */
export function readIdempotencyKey(headers: Headers): string | null {
  const k = headers.get("idempotency-key");
  // Headers joins repeats with ", ", which the rule refuses.
  return k !== null && IDEMPOTENCY_KEY.test(k) ? k : null;
}

/** Exactly `{mfa_code}` (6 digits) or `{backup_code}`; nothing else. */
export function readStepUpBody(v: unknown): StepUpBody | null {
  if (!plain(v)) return null;
  const k = onlyKey(v);
  const s = k === null ? undefined : v[k];
  if (typeof s !== "string") return null;
  if (k === "mfa_code" && DIGITS.test(s)) return { mfa_code: s };
  // Core's shape exactly (xxxxx-xxxxx, its alphabet), as the page sends it.
  if (k === "backup_code" && readBackupCode(s)) return { backup_code: s };
  return null;
}

/** Exactly `{code}`: 6 digits from the new app. */
export function readConfirmBody(v: unknown): { code: string } | null {
  if (!plain(v) || onlyKey(v) !== "code") return null;
  return typeof v.code === "string" && DIGITS.test(v.code)
    ? { code: v.code }
    : null;
}

const ISSUER = "MHAI";
const FIXED: Readonly<Record<string, string>> = {
  issuer: ISSUER,
  algorithm: "SHA1",
  digits: "6",
  period: "30",
};
const PARAMS = new Set(["secret", ...Object.keys(FIXED)]);
/** RFC 4648 base32, upper case, no padding (core's 20 bytes are 32 characters). */
const SECRET = /^[A-Z2-7]{16,128}$/;
const PREFIX = "otpauth://totp/";
const URI_MAX = 2048;
// Control, format (bidi) and other invisible characters, and white space.
const UNSAFE = /[\p{C}\s]/u;

/**
 * Core's otpauth URI, checked strictly: `otpauth://totp/MHAI:<account>`
 * with exactly the secret (base32) and issuer MHAI, SHA1, 6 digits and 30
 * seconds. What the browser gets is rebuilt from the checked parts, so no
 * other text from core reaches the QR code. Null when anything is off.
 */
export function readOtpauthUri(raw: string): ReplaceSetup | null {
  if (raw.length > URI_MAX || !raw.startsWith(PREFIX)) return null;
  if (!/^[\x21-\x7e]+$/.test(raw) || raw.includes("#")) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (
    u.protocol !== "otpauth:" ||
    u.host !== "totp" ||
    u.username ||
    u.password ||
    u.port
  )
    return null;
  let label: string;
  try {
    label = decodeURIComponent(u.pathname.slice(1));
  } catch {
    return null;
  }
  if (!label.startsWith(`${ISSUER}:`)) return null;
  const account = label.slice(ISSUER.length + 1);
  if (
    !account ||
    account.length > 254 ||
    UNSAFE.test(account) ||
    account.includes(":") ||
    account.includes("/")
  )
    return null;
  const seen = new Set<string>();
  for (const [k] of u.searchParams) {
    if (!PARAMS.has(k) || seen.has(k)) return null;
    seen.add(k);
  }
  if (seen.size !== PARAMS.size) return null;
  for (const [k, want] of Object.entries(FIXED))
    if (u.searchParams.get(k) !== want) return null;
  const secret = u.searchParams.get("secret") ?? "";
  if (!SECRET.test(secret)) return null;
  return {
    otpauthUri:
      `${PREFIX}${ISSUER}:${encodeURIComponent(account)}` +
      `?secret=${secret}&issuer=${ISSUER}&algorithm=SHA1&digits=6&period=30`,
    secret,
  };
}

/** Core's reply to `POST /auth/mfa/replace`: exactly `{otpauth_uri}`. */
export function readReplaceReply(v: unknown): ReplaceSetup | null {
  if (!plain(v) || onlyKey(v) !== "otpauth_uri") return null;
  return typeof v.otpauth_uri === "string"
    ? readOtpauthUri(v.otpauth_uri)
    : null;
}

/**
 * Core's refusal as the browser may see it: the code only, from a fixed
 * list. At the start, 409 `conflict` means two-step isn't on, which the
 * screens treat like `mfa_required`; at confirm it means nothing is
 * waiting any more (or it is older than 15 minutes): start again.
 */
export function replaceRefusal(
  e: unknown,
  step: "start" | "confirm",
): { status: number; code: ReplaceCode } {
  if (!(e instanceof UpstreamError))
    return { status: 503, code: "unavailable" };
  switch (e.code) {
    case "unauthenticated":
    case "token_expired":
      return { status: 401, code: "session_expired" };
    case "mfa_required":
      return { status: 403, code: "mfa_required" };
    case "mfa_invalid":
      return { status: 403, code: "mfa_invalid" };
    case "mfa_locked":
      return { status: 429, code: "mfa_locked" };
    case "rate_limited":
      return { status: 429, code: "rate_limited" };
    case "conflict":
      return step === "start"
        ? { status: 403, code: "mfa_required" }
        : { status: 409, code: "conflict" };
    case "invalid":
    case "validation_failed":
      return { status: 422, code: "invalid" };
  }
  if (e.status === 401) return { status: 401, code: "session_expired" };
  return { status: 503, code: "unavailable" };
}
