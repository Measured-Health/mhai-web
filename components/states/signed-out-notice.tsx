"use client";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { useSignedOutNotice } from "./session-timeout";

/** Persistent explanation after an idle sign-out (until dismissed). */
export function SignedOutNotice() {
  const { afterMin, dismiss } = useSignedOutNotice();
  if (afterMin === null) return null;
  return (
    <div className="mx-auto mb-5 max-w-[700px]">
      <Banner tone="info" title="Signed out for privacy">
        <p>
          You were signed out after {afterMin} minutes of inactivity. Unsaved
          work was cleared to protect patient data.
        </p>
        <Button variant="ghost" className="mt-2" onClick={dismiss}>
          Dismiss
        </Button>
      </Banner>
    </div>
  );
}
