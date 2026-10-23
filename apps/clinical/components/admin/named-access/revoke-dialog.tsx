"use client";
import { useRef, useState } from "react";
import { NOTE_MAX, REVOKE_LABEL, type RevokeReason } from "@mhai/ui/clearances";
import { useNetwork } from "@mhai/api-client/network";
import { useToast } from "@mhai/ui/toast";
import type { ClearanceOut } from "@/lib/api/clearances-contract";
import { isMfaRequired } from "@/lib/admin-queries";
import { useRevokeClearance } from "@/lib/clearance-queries";
import { ConfirmDialog } from "../confirm-dialog";
import { StepUpFields, useStepUp } from "../step-up-fields";
import { ReasonFields, useLetterAnswer } from "./letter-write";

const REASONS = Object.keys(REVOKE_LABEL) as RevokeReason[];

/**
 * Revoke a letter: a reason, a note (needed for Other) and the admin's
 * two-step code. Any hospital admin can, not only the uploader. It sends the
 * letter's version, so a letter changed since is refused, never overwritten.
 * Mounted only while open: closing forgets the code.
 */
export function RevokeDialog({
  letter,
  onClose,
}: {
  letter: ClearanceOut;
  onClose(): void;
}) {
  const revoke = useRevokeClearance();
  const toast = useToast();
  const { online } = useNetwork();
  const step = useStepUp();
  const answer = useLetterAnswer(step);
  const sending = useRef(false);
  const [reason, setReason] = useState<RevokeReason | null>(null);
  const [note, setNote] = useState("");

  const noteNeeded = reason === "other" && note.trim() === "";
  const ready =
    reason !== null &&
    !noteNeeded &&
    note.length <= NOTE_MAX &&
    step.ready &&
    !answer.blocked;
  const busy = revoke.isPending;

  const keep = () => {
    if (busy) return;
    revoke.reset();
    onClose();
  };

  function confirm() {
    if (!ready || !reason || sending.current) return;
    sending.current = true;
    answer.clear();
    const auth = step.auth();
    const text = note.trim();
    revoke.mutate(
      {
        id: letter.id,
        body: {
          reason,
          ...(text ? { note: text } : {}),
          version: letter.version,
          ...auth,
        },
      },
      {
        onSuccess: () => {
          toast.show({
            title: "Letter revoked",
            body: "Named access under it has ended.",
            tone: "ok",
          });
          answer.spent(auth);
          revoke.reset();
          onClose();
        },
        onError: (e) => {
          if (isMfaRequired(e)) answer.require();
          answer.refused(e);
        },
        onSettled: (_d, e) => {
          sending.current = false;
          // Forget the call, and with it the spent code.
          if (e) revoke.reset();
        },
      },
    );
  }

  return (
    <ConfirmDialog
      open
      title="Revoke this letter?"
      keepLabel="Keep letter"
      confirmLabel="Revoke letter"
      onKeep={keep}
      onConfirm={confirm}
      busy={busy}
      error={answer.error}
      offline={!online}
      ready={ready}
    >
      <p>Named access under this letter ends at once.</p>
      <ReasonFields
        legend="Why are you revoking it?"
        labels={REVOKE_LABEL}
        reasons={REASONS}
        reason={reason}
        onReason={setReason}
        note={note}
        onNote={setNote}
        busy={busy}
      />
      <StepUpFields
        step={step}
        busy={busy}
        invalid={answer.wrongCode}
        blocked={answer.blocked}
        blockedTitle="Turn on two-step verification in Profile & security to revoke a letter."
        onToggle={answer.clear}
        autoSubmit={false}
      />
    </ConfirmDialog>
  );
}
