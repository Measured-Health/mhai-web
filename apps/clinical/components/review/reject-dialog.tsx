"use client";
import type { RejectIn, RejectReasonCode } from "@/lib/api/contract";
import {
  NOTE_MAX,
  REJECT_REASONS,
  type DecisionError,
} from "@/lib/corrections";
import { ReasonDialog } from "../ui/reason-form";

type Props = {
  open: boolean;
  onClose(): void;
  /** Who suggested the correction: they will read the reason. */
  submitter: string;
  /** Decided elsewhere while the dialog was open (Review Focus 1). */
  gone: boolean;
  busy: boolean;
  error: DecisionError | null;
  onSubmit(r: RejectIn): void;
};

/** Reject needs a reason (spec §5.4). A dialog on desktop, a sheet on phones. */
export function RejectDialog({ submitter, error, onSubmit, ...rest }: Props) {
  return (
    <ReasonDialog<RejectReasonCode>
      {...rest}
      dialogTitle="Why are you rejecting this?"
      sheetTitle="Why reject this?"
      reasons={REJECT_REASONS}
      noteMax={NOTE_MAX}
      submitLabel="Reject with reason"
      tone="bad"
      goneTitle="Another clinician has already decided this correction"
      goneBody="Nothing you write here will be sent. Close this and carry on with the next one."
      failure={error && { title: error.title, body: error.body }}
      footnote={`${submitter} will see your reason.`}
      onSubmit={(code, note) =>
        onSubmit(note ? { reason_code: code, note } : { reason_code: code })
      }
    />
  );
}
