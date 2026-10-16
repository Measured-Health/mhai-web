"use client";
import { useId, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";

const POINTS = [
  [
    "Decision support, not a decision.",
    "You remain responsible for every clinical action.",
  ],
  [
    "Check flagged items.",
    "Amber and red results need your review before acting.",
  ],
  [
    "Patient privacy.",
    "Don't enter names, phone numbers or ID numbers. Details are masked, but entering less is safer.",
  ],
  ["Feedback helps.", "Your agreements and corrections improve the system."],
] as const;

export function TermsStep({
  eyebrow,
  onDone,
}: {
  eyebrow: string;
  onDone(): void;
}) {
  const { client, signOut } = useAuth();
  const id = useId();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.acceptTerms();
      onDone();
    } catch (e) {
      const ae = errorCode(e);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <AuthHeading
        eyebrow={eyebrow}
        title="Before you start"
        sub="Please read and confirm. This takes 30 seconds."
      />
      {error && <AuthErrorBanner error={error} />}
      <ul className="flex flex-col gap-3 text-[14px] leading-normal">
        {POINTS.map(([lead, rest]) => (
          <li key={lead} className="rounded-2xl bg-bg px-4 py-3">
            <b>{lead}</b> {rest}
          </li>
        ))}
      </ul>
      <label
        htmlFor={id}
        className="mt-5 flex min-h-11 items-center gap-2.5 text-[13.5px]"
      >
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="size-4 accent-mint-deep"
        />
        I understand and agree to use MHAI this way
      </label>
      <Button
        className="mt-3 w-full"
        disabled={!agreed || busy}
        onClick={() => void go()}
      >
        Continue
      </Button>
    </div>
  );
}
