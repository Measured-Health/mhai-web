"use client";
import { useState } from "react";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import type { StepUp } from "@/lib/api/contract";
import { useAuth } from "@/lib/auth/auth-context";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { SaveBackupCode } from "@mhai/ui/auth/save-backup-code";
import { Dialog } from "@mhai/ui/dialog";
import { codeOf, StepUpDialog } from "../hospitals/step-up-dialog";

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
  const make = useKeyedMutation(
    (code: StepUp, key: string) => client.regenerateBackupCode(code, key),
    {},
    { gcTime: 0 },
  );
  const call = useStepUpCall(make);
  const [made, setMade] = useState<string | null>(null);
  const close = () => {
    setMade(null);
    call.clear();
    onClose();
  };
  if (made)
    return (
      // Once the code shows, only Continue closes it.
      <Dialog open onClose={() => {}} title={TITLE}>
        <SaveBackupCode code={made} kind="new" onContinue={close} />
      </Dialog>
    );
  return (
    <StepUpDialog
      open={open}
      title={TITLE}
      intro="Your current backup code will stop working. You'll see the new one once, so have somewhere ready to save it."
      confirmLabel="Make a new backup code"
      tone="primary"
      busy={call.busy}
      error={call.error}
      onClose={close}
      onConfirm={(input) =>
        call.run(codeOf(input), {
          onSuccess: (code) => {
            updateUser({ backupCodesLeft: 1 });
            setMade(code);
          },
        })
      }
    />
  );
}
