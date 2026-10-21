"use client";
import { useEffect, useRef, type ReactNode } from "react";
import type { AuthError } from "@/lib/auth/types";
import { Banner } from "@mhai/ui/banner";
import { authErrorCopy } from "./auth-error-copy";

/** A red sign-in error that takes focus when it appears. */
export function AuthErrorBanner({
  error,
  noun,
  copy: override,
  children,
}: {
  error: AuthError;
  noun?: string;
  /** Replaces the standard wording for this error. */
  copy?: { title: string; body: string };
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [error]);
  const copy =
    override ??
    authErrorCopy(error.code, {
      noun,
      attemptsLeft: error.attemptsLeft,
    });
  return (
    <div ref={ref} tabIndex={-1} className="mb-4 outline-none">
      <Banner tone="bad" title={copy.title}>
        <p>{copy.body}</p>
        {children}
      </Banner>
    </div>
  );
}
