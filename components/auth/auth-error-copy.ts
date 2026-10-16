import { AuthError, type AuthErrorCode } from "@/lib/auth/types";

/** Shared wording for sign-in and code errors. */
export function authErrorCopy(
  code: AuthErrorCode,
  {
    noun = "email",
    attemptsLeft,
  }: { noun?: string; attemptsLeft?: number } = {},
): { title: string; body: string } {
  switch (code) {
    case "invalid_credentials":
      return {
        title: `That ${noun} and password don't match.`,
        body:
          "Check them and try again." +
          (attemptsLeft !== undefined
            ? ` ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left before a 15-minute lock.`
            : ""),
      };
    case "locked":
      return {
        title: "Your account is locked for 15 minutes.",
        body: "Too many tries. Wait, then try again, or reset your password.",
      };
    case "rate_limited":
      return {
        title: "Too many tries right now.",
        body: "Wait a minute, then try again.",
      };
    case "mfa_invalid":
      return {
        title: "That code didn't work.",
        body: "Check your authenticator app and try the newest code.",
      };
    case "mfa_expired":
      return {
        title: "That took too long.",
        body: "For your security, sign in again to get a new code.",
      };
    case "sso_failed":
      return {
        title: "We couldn't sign you in with your hospital account.",
        body: "Try again, or use your email and password.",
      };
    default:
      return {
        title: "We can't reach MHAI right now.",
        body: "Check your connection and try again in a moment.",
      };
  }
}

export const errorCode = (e: unknown): AuthError =>
  e instanceof AuthError ? e : new AuthError("unavailable");
