"use client";
import { useState } from "react";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { useNetwork } from "@mhai/api-client/network";
import { stepUpBody, type StepUpAuth } from "@/lib/api/admin-contract";
import { useAuth } from "@/lib/auth/auth-context";
import { SaveBackupCode } from "@mhai/ui/auth/save-backup-code";
import { Dialog } from "@mhai/ui/dialog";
import { StepUpDialog } from "../admin/step-up-fields";

const TITLE = "New backup code";

/**
 * Makes a new backup code through the step-up dialog (the two-step code
 * or the current backup code). The old one stops working; the new one is
 * shown once, and only Continue (after 3 s) closes it and forgets it. The
 * code sent is in the call only (`gcTime: 0`, reset after every answer).
 */
export function NewBackupCodeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const { client, updateUser } = useAuth();
  const { online } = useNetwork();
  const make = useKeyedMutation(
    (auth: StepUpAuth, key: string) =>
      client.regenerateBackupCode(stepUpBody(auth), key),
    {},
    { gcTime: 0 },
  );
  const [made, setMade] = useState<string | null>(null);
  const close = () => {
    setMade(null);
    make.reset();
    onClose();
  };
  if (!open) return null;
  if (made)
    return (
      // Once the code shows, only Continue closes it.
      <Dialog open onClose={() => {}} title={TITLE}>
        <SaveBackupCode code={made} kind="new" onContinue={close} />
      </Dialog>
    );
  return (
    <StepUpDialog
      title={TITLE}
      keepLabel="Cancel"
      confirmLabel="Make a new backup code"
      confirmVariant="primary"
      blockedTitle="Turn on two-step verification first."
      offline={!online}
      send={async (auth) => setMade(await make.mutateAsync(auth))}
      reset={make.reset}
      onKeep={close}
      onDone={() => updateUser({ backupCodesLeft: 1 })}
    >
      Your current backup code will stop working. You&apos;ll see the new one
      once, so have somewhere ready to save it.
    </StepUpDialog>
  );
}
