"use client";
import type { DismissIn, DismissReason } from "@/lib/api/alerts-contract";
import {
  DISMISS_NOTE_MAX,
  DISMISS_REASONS,
} from "@/lib/notifications/alert-view";
import { ReasonDialog } from "@mhai/ui/reason-form";

type Props = {
  open: boolean;
  onClose(): void;
  patient: string;
  /** Someone else handled it while this was open (Review Focus 1). */
  gone: boolean;
  busy: boolean;
  failed: boolean;
  /** Offline: nothing can be sent, and the dialog says so. */
  offline: boolean;
  onSubmit(d: DismissIn): void;
};

/** Dismiss needs a reason (spec §3). A dialog on desktop, a sheet on phones, like Reject. */
export function DismissDialog({
  patient,
  failed,
  offline,
  onSubmit,
  ...rest
}: Props) {
  return (
    <ReasonDialog<DismissReason>
      {...rest}
      dialogTitle="Dismiss this alert?"
      sheetTitle="Dismiss this alert?"
      reasons={DISMISS_REASONS}
      noteMax={DISMISS_NOTE_MAX}
      submitLabel="Dismiss alert"
      intro={
        <p className="text-[13.5px] text-ink-2 [overflow-wrap:anywhere]">
          The alert for {patient} moves to Dismissed. Your reason helps tune
          alerts for your hospital.
        </p>
      }
      goneTitle="Someone else handled this alert"
      goneBody="Nothing you choose here will be sent. Close this and carry on."
      failure={
        failed
          ? {
              title: "Couldn't dismiss the alert",
              body: "Check your connection and try again.",
            }
          : null
      }
      noteHint="Don't add names or record numbers."
      blocked={
        offline ? "You're offline. Dismiss needs a connection." : undefined
      }
      onSubmit={(reason, note) =>
        onSubmit(note ? { reason, note } : { reason })
      }
    />
  );
}
