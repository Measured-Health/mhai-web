"use client";
import { useId } from "react";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

/**
 * "Lose what you typed?": keeping it is the safe default and comes first.
 * Shared by the unsaved-draft guard and the patient-alert prefill, so both
 * ask the same way.
 */
export function DiscardDialog({
  open,
  title,
  body,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
  blocked,
}: {
  open: boolean;
  title: string;
  body: string;
  keepLabel: string;
  discardLabel: string;
  onKeep(): void;
  onDiscard(): void;
  /** Why the draft can't be replaced right now; disables it and says so. */
  blocked?: string;
}) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onKeep} title={title}>
      <p className="mb-[18px] text-[14.5px] leading-normal text-ink-2">
        {body}
      </p>
      {blocked && (
        <p
          id={`${id}-blocked`}
          className="-mt-2 mb-[18px] text-[13px] text-ink-3"
        >
          {blocked}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onKeep}>{keepLabel}</Button>
        <Button
          variant="danger"
          disabled={!!blocked}
          aria-describedby={blocked ? `${id}-blocked` : undefined}
          onClick={onDiscard}
        >
          {discardLabel}
        </Button>
      </div>
    </Dialog>
  );
}
