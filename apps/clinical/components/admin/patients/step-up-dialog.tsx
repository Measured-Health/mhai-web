"use client";
import { useRef, useState, type ReactNode } from "react";
import { isMfaRequired } from "@/lib/admin-queries";
import type { AdminError } from "@/lib/admin/errors";
import type { StepUpAuth } from "@/lib/api/patients-contract";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { BACKUP_FAILED_BODY } from "@mhai/ui/auth/backup-code-toggle";
import { useNetwork } from "@mhai/api-client/network";
import { ConfirmDialog } from "../confirm-dialog";
import { StepUpFields, useStepUp } from "../step-up-fields";

/**
 * A patient decision confirmed with the admin's own two-step code. `send`
 * makes the call; a wrong code keeps the dialog open with the boxes
 * cleared, any other refusal is shown as `toError` words it. One
 * confirmation sends one request.
 */
export function StepUpDialog({
  title,
  confirmLabel,
  keepLabel = "Cancel",
  children,
  ready = true,
  busy,
  send,
  toError,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  keepLabel?: string;
  children: ReactNode;
  /** False until the rest of the form is complete. */
  ready?: boolean;
  busy: boolean;
  send(auth: StepUpAuth, done: (e?: unknown) => void): void;
  toError(e: unknown): AdminError;
  onClose(): void;
}) {
  const { user, updateUser } = useAuth();
  const { online } = useNetwork();
  const step = useStepUp();
  const [error, setError] = useState<AdminError | null>(null);
  const [required, setRequired] = useState(false);
  const sending = useRef(false);
  const blocked = required || user?.mfaEnabled === false;

  function confirm() {
    if (!step.ready || blocked || !ready || sending.current) return;
    sending.current = true;
    setError(null);
    const auth = step.auth();
    const backup = "backupCode" in auth;
    send(auth, (e) => {
      sending.current = false;
      if (e === undefined) {
        // A backup code works once; Profile & security shows what's left.
        if (backup && user?.backupCodesLeft != null)
          updateUser({
            backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
          });
        return;
      }
      if (isMfaRequired(e)) return setRequired(true);
      const err = toError(e);
      const wrong = e instanceof ApiError && e.code === "mfa_invalid";
      setError(wrong && backup ? { ...err, body: BACKUP_FAILED_BODY } : err);
      if (wrong) step.wrong();
    });
  }

  return (
    <ConfirmDialog
      open
      title={title}
      keepLabel={keepLabel}
      confirmLabel={confirmLabel}
      onKeep={onClose}
      onConfirm={confirm}
      busy={busy}
      error={error}
      offline={!online}
      ready={step.ready && !blocked && ready}
    >
      {children}
      <StepUpFields
        step={step}
        busy={busy}
        invalid={error !== null}
        blocked={blocked}
        blockedTitle="Turn on two-step verification in Profile & security to decide about patients."
        onToggle={() => setError(null)}
        autoSubmit={ready}
      />
    </ConfirmDialog>
  );
}
