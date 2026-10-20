"use client";
import type { ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { canUse, type Area } from "@/lib/auth/types";
import { useRedirect } from "@/lib/auth/use-redirect";

/**
 * Screens for a signed-in person who has finished first sign-in and may use
 * this side (`need`): "clinical", "admin", or "any" (the shared shell and
 * the account page). Everyone else is redirected to their home and nothing
 * mounts meanwhile, so no query for the wrong side runs. A hospital admin
 * without two-step owes its setup step, so they reach no page until it's
 * done (amendment 3). After a sign-out the gate redirects again, so Back
 * never leaves a blank page.
 */
export function AuthGate({
  children,
  need = "clinical",
}: {
  children: ReactNode;
  need?: Area | "any";
}) {
  const { status, user, steps } = useAuth();
  const home = status === "signed_in" ? homeFor({ user, steps }) : null;
  let target: string | null = null;
  if (status === "signed_out") target = "/sign-in";
  else if (home === "/welcome" || home === "/no-access") target = home;
  else if (home && need !== "any" && !canUse(user, need)) target = home;
  useRedirect(target);
  if (status !== "signed_in" || target) return null;
  return children;
}
