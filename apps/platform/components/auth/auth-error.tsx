"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { AuthError, type AuthErrorCode } from "@/lib/auth/types";
import { Banner } from "@mhai/ui/banner";

export const NOT_PLATFORM = "This account can't use the platform admin app.";

/** Plain wording for sign-in and code errors. */
export function authErrorCopy(
  code: AuthErrorCode,
  { attemptsLeft }: { attemptsLeft?: number } = {},
): { title: string; body: string } {
  switch (code) {
    case "invalid_credentials":
      return {
        title: "That email and password don't match.",
        body:
          "Check them and try again." +
          (attemptsLeft !== undefined
            ? ` ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left before a 15-minute lock.`
            : ""),
      };
    case "locked":
      return {
        title: "Your account is locked for 15 minutes.",
        body: "Too many tries. Wait, then try again.",
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
    case "mfa_locked":
      return {
        title: "Too many wrong codes. Try again in 15 minutes.",
        body: "For your security, codes are paused for this account.",
      };
    case "mfa_expired":
      return {
        title: "That took too long.",
        body: "For your security, sign in again to get a new code.",
      };
    case "not_platform":
      return {
        title: NOT_PLATFORM,
        body: "It's for Measured Health platform admins and auditors. Hospital staff use the MHAI app.",
      };
    case "weak_password":
      return {
        title: "Choose a stronger password",
        body: "That one is too common or has appeared in a leak. Try another.",
      };
    case "wrong_password":
      return {
        title: "That password isn't right.",
        body: "Check it and try again.",
      };
    case "session_expired":
      return {
        title: "Your session ended.",
        body: "Sign in again to continue.",
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

/** A red sign-in error that takes focus when it appears. */
export function AuthErrorBanner({
  error,
  copy: override,
  children,
}: {
  error: AuthError;
  /** Replaces the standard wording for this error. */
  copy?: { title: string; body: string };
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [error]);
  const copy =
    override ?? authErrorCopy(error.code, { attemptsLeft: error.attemptsLeft });
  return (
    <div ref={ref} tabIndex={-1} className="mb-4 outline-none">
      <Banner tone="bad" title={copy.title}>
        <p>{copy.body}</p>
        {children}
      </Banner>
    </div>
  );
}
