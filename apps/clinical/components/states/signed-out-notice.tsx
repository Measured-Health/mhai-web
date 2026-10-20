"use client";
import { useAuth, type SignOutReason } from "@/lib/auth/auth-context";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";

const COPY: Record<SignOutReason, { title: string; body: string }> = {
  idle: {
    title: "Signed out for privacy",
    body: "You were signed out after 15 minutes of inactivity. Unsaved work was cleared to protect patient data.",
  },
  manual: {
    title: "You've signed out",
    body: "Your session history was cleared from this device.",
  },
  expired: {
    title: "Your session ended",
    body: "Sign in again to continue. Unsaved work was cleared to protect patient data.",
  },
};

/** Why you were signed out, until dismissed. Memory only. */
export function SignedOutNotice() {
  const { signedOutReason, dismissNotice } = useAuth();
  if (!signedOutReason) return null;
  const { title, body } = COPY[signedOutReason];
  return (
    <div className="mb-5">
      <Banner tone="info" title={title}>
        <p>{body}</p>
        <Button variant="ghost" className="mt-2" onClick={dismissNotice}>
          Dismiss
        </Button>
      </Banner>
    </div>
  );
}
