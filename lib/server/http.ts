import type { AuthErrorCode } from "../auth/types";
import { UpstreamError } from "./api";

export const json = (status: number, body?: object) =>
  body === undefined
    ? new Response(null, { status, headers: { "Cache-Control": "no-store" } })
    : Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const forbidden = () => json(403, { code: "forbidden" });

/** Writes must come from this app's own pages (SameSite=Strict plus this). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Maps an upstream failure to the app's auth error codes. */
export function authCode(
  e: unknown,
  ctx: "login" | "mfa" | "current" | "other",
): { status: number; code: AuthErrorCode } {
  if (!(e instanceof UpstreamError))
    return { status: 503, code: "unavailable" };
  switch (e.code) {
    case "login_locked":
      return { status: 429, code: "locked" };
    case "rate_limited":
      return { status: 429, code: "rate_limited" };
    case "mfa_invalid":
      return { status: 401, code: "mfa_invalid" };
    case "validation_failed":
      return {
        status: 422,
        code: ctx === "login" ? "invalid_credentials" : "weak_password",
      };
    case "unauthenticated":
      return {
        status: 401,
        code:
          ctx === "login"
            ? "invalid_credentials"
            : ctx === "mfa"
              ? "mfa_expired"
              : ctx === "current"
                ? "wrong_password"
                : "session_expired",
      };
    case "token_expired":
      return {
        status: 401,
        code: ctx === "mfa" ? "mfa_expired" : "session_expired",
      };
    default:
      return { status: 503, code: "unavailable" };
  }
}
