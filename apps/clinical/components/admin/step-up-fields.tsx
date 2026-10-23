"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { StaffRemoveAuth } from "@/lib/api/admin-contract";
import {
  BackupCodeInput,
  BackupCodeToggle,
  useCodeOrBackup,
} from "@mhai/ui/auth/backup-code-toggle";
import { CodeInput } from "@mhai/ui/auth/code-input";
import { Banner } from "@mhai/ui/banner";

/**
 * The admin's own two-step code for a sensitive change: a 6-digit code, or
 * a backup code. `auth()` is what to send; `wrong()` clears a refused code
 * and puts the focus back in the box.
 */
export function useStepUp() {
  const c = useCodeOrBackup();
  const [focusKey, setFocusKey] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);
  return {
    ...c,
    focusKey,
    backupRef,
    auth: (): StaffRemoveAuth =>
      c.backup ? { backupCode: c.value } : { mfaCode: c.value },
    wrong() {
      c.setCode("");
      if (c.backup) backupRef.current?.focus();
      else setFocusKey((k) => k + 1);
    },
  };
}

export type StepUpState = ReturnType<typeof useStepUp>;

/**
 * The code boxes, the backup-code switch, and, for an admin without
 * two-step, a pointer to Profile & security instead. Inside a form: with
 * `autoSubmit`, the sixth digit submits it.
 */
export function StepUpFields({
  step,
  busy,
  invalid,
  blocked,
  blockedTitle,
  onToggle,
  autoSubmit = true,
}: {
  step: StepUpState;
  busy: boolean;
  /** The last code was refused: the boxes show it. */
  invalid: boolean;
  /** This admin has no two-step, so no code can be entered. */
  blocked: boolean;
  /** e.g. "Turn on two-step verification in Profile & security to remove staff." */
  blockedTitle: string;
  /** Switching between the app and a backup code (clear any error). */
  onToggle(): void;
  autoSubmit?: boolean;
}) {
  const id = useId();
  if (blocked)
    return (
      <div className="mt-3">
        <Banner tone="warn" title={blockedTitle}>
          Then come back and try again.{" "}
          <Link href="/account" className="font-semibold underline">
            Profile &amp; security
          </Link>
        </Banner>
      </div>
    );
  return (
    <div className="mt-4">
      <p className="mb-2 text-[13px]">
        {step.backup
          ? "Enter one of your backup codes to confirm."
          : "Enter the 6-digit code from your authenticator app to confirm."}
      </p>
      {step.backup ? (
        <BackupCodeInput
          id={`${id}-backup`}
          inputRef={step.backupRef}
          value={step.code}
          onChange={step.setCode}
          disabled={busy}
        />
      ) : (
        <CodeInput
          autoSubmit={autoSubmit}
          value={step.code}
          onChange={step.setCode}
          label="Your two-step code"
          disabled={busy}
          invalid={invalid}
          focusKey={step.focusKey}
        />
      )}
      <p className="mt-1 text-[13px] text-ink-3">
        <BackupCodeToggle
          backup={step.backup}
          onChange={(b) => {
            step.setBackup(b);
            onToggle();
          }}
        />
      </p>
    </div>
  );
}
