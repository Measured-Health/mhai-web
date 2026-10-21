"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { hasPlatformRole } from "@/lib/auth/types";
import { useRedirect } from "@/lib/auth/use-redirect";
import { NoAccess } from "./no-access";

/**
 * Screens for a signed-in platform admin or auditor who has finished first
 * sign-in. A guest goes to /sign-in and anyone owing steps to /welcome;
 * nothing mounts meanwhile, so no query runs. An account with no platform
 * role is refused: the NoAccess content stays on screen and it is signed
 * out (the server refuses such sessions too).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, steps, refuse } = useAuth();
  const noRole = status === "signed_in" && !hasPlatformRole(user);
  // Kept once seen, so the refusal stays after the sign-out it causes.
  const [refused, setRefused] = useState(false);
  if (noRole && !refused) setRefused(true);
  useEffect(() => {
    if (noRole) void refuse();
  }, [noRole, refuse]);

  let target: string | null = null;
  if (!refused) {
    if (status === "signed_out") target = "/sign-in";
    else if (status === "signed_in" && steps.length) target = "/welcome";
  }
  useRedirect(target);
  if (refused) return <NoAccess />;
  if (status !== "signed_in" || target) return null;
  return children;
}
