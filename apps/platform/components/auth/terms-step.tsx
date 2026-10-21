"use client";
import { useId, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { TERMS_VERSION } from "@/lib/auth/terms";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthErrorBanner, errorCode } from "./auth-error";
import { AuthHeading } from "./auth-layout";

const POINTS = [
  [
    "You act for Measured Health.",
    "Every change you make is recorded with your name and the time.",
  ],
  [
    "No patient data.",
    "This app never shows patient records. Don't put any in notes or reasons.",
  ],
  [
    "Two-step is required.",
    "You confirm sign-in and the biggest changes with a code from your app.",
  ],
  [
    "Keep your sign-in to yourself.",
    "Never share your password, codes or a signed-in screen.",
  ],
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
        sub="Read and confirm how this app is used."
      />
      {error && <AuthErrorBanner error={error} />}
      <ul className="flex list-disc flex-col gap-2.5 rounded-2xl bg-bg py-4 pl-9 pr-4 text-[13.5px] leading-normal">
        {POINTS.map(([lead, rest]) => (
          <li key={lead}>
            <b>{lead}</b> {rest}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-3">
        Terms version {TERMS_VERSION}
      </p>
      <label
        htmlFor={id}
        className="mt-4 flex min-h-11 items-center gap-2.5 text-[13.5px]"
      >
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="size-4 accent-mint-deep"
        />
        I understand and agree
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
