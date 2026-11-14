"use client";
import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import type { StepUpAuth } from "@/lib/api/admin-contract";
import { ApiError } from "@/lib/api/errors";
import { isMfaRequired } from "@/lib/admin-queries";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { useAuth } from "@/lib/auth/auth-context";
import {
  BACKUP_FAILED_BODY,
  BackupCodeInput,
  BackupCodeToggle,
  useCodeOrBackup,
} from "@mhai/ui/auth/backup-code-toggle";
import { CodeInput } from "@mhai/ui/auth/code-input";
import { Banner } from "@mhai/ui/banner";
import { ConfirmDialog } from "./confirm-dialog";

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
    auth: (): StepUpAuth =>
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

/**
 * A change that needs the admin's own two-step code (core's step-up): the
 * confirmation, the code boxes, and every answer. A wrong code keeps the
 * dialog open and clears the boxes; a backup code spent is counted; an
 * admin without two-step is pointed at Profile & security. `send` is the
 * mutation's `mutateAsync`; `reset` forgets it (and the code) after every
 * answer. `onGone` closes the dialog when the person no longer exists.
 */
export function StepUpDialog({
  title,
  children,
  keepLabel,
  confirmLabel,
  confirmVariant = "danger",
  blockedTitle,
  offline,
  send,
  reset,
  onKeep,
  onDone,
  onGone,
  onStale,
}: {
  title: string;
  children: ReactNode;
  keepLabel: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  /** e.g. "Turn on two-step verification in Profile & security to deactivate staff." */
  blockedTitle: string;
  offline: boolean;
  send(auth: StepUpAuth): Promise<unknown>;
  reset(): void;
  onKeep(): void;
  onDone(): void;
  onGone?(e: AdminError): void;
  /** Someone else changed it first (409): the latest is loading underneath. */
  onStale?(e: AdminError): void;
}) {
  const { user, updateUser } = useAuth();
  const step = useStepUp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);
  const [required, setRequired] = useState(false);
  // One confirmation sends one request, even if a click and the last digit
  // land before the next render.
  const sending = useRef(false);
  // Every admin has two-step (amendment 3), so this is only ever stale state.
  const blocked = required || user?.mfaEnabled === false;

  async function confirm() {
    if (!step.ready || blocked || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const backup = step.backup;
    try {
      await send(step.auth());
      // A backup code works once; Profile & security shows what's left.
      if (backup && user?.backupCodesLeft != null)
        updateUser({ backupCodesLeft: Math.max(0, user.backupCodesLeft - 1) });
      reset();
      onDone();
    } catch (e) {
      reset();
      const err = adminError(e);
      if (err.gone && onGone) return onGone(err);
      if (err.stale && onStale) return onStale(err);
      if (isMfaRequired(e)) return setRequired(true);
      const wrong = e instanceof ApiError && e.code === "mfa_invalid";
      setError(wrong && backup ? { ...err, body: BACKUP_FAILED_BODY } : err);
      if (wrong) step.wrong();
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title={title}
      keepLabel={keepLabel}
      confirmLabel={confirmLabel}
      confirmVariant={confirmVariant}
      onKeep={() => {
        reset();
        onKeep();
      }}
      onConfirm={() => void confirm()}
      busy={busy}
      error={error}
      offline={offline}
      ready={step.ready && !blocked}
    >
      <div>{children}</div>
      <StepUpFields
        step={step}
        busy={busy}
        invalid={error !== null}
        blocked={blocked}
        blockedTitle={blockedTitle}
        onToggle={() => setError(null)}
      />
    </ConfirmDialog>
  );
}
