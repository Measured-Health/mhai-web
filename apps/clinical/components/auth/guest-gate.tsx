"use client";
import type { ReactNode } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { useRedirect } from "@/lib/auth/use-redirect";

/** Pages for signed-out people; anyone signed in goes where they belong. */
export function GuestGate({ children }: { children: ReactNode }) {
  const { status, user, steps } = useAuth();
  const target = status === "signed_in" ? homeFor({ user, steps }) : null;
  useRedirect(target);
  if (status === "loading" || target) return null;
  return children;
}
