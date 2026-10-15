"use client";
import type { ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { useRedirect } from "@/lib/auth/use-redirect";

/**
 * Clinical screens only for a signed-in clinician who has finished first
 * sign-in. Everyone else is redirected, and nothing clinical mounts
 * meanwhile (no clinical query can run). After a sign-out, signOut has
 * already navigated, so the gate only renders nothing.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, steps, signedOutReason } = useAuth();
  const home = status === "signed_in" ? homeFor({ user, steps }) : null;
  const target =
    status === "signed_out"
      ? signedOutReason
        ? null
        : "/sign-in"
      : home !== "/"
        ? home
        : null;
  useRedirect(target);
  if (status !== "signed_in" || target) return null;
  return children;
}
