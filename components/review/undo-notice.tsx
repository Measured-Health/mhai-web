"use client";
import { CheckCircle2 } from "lucide-react";
import type { Ref } from "react";
import { correctionTitle } from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import type { PendingApproval } from "@/lib/review/use-undoable-approval";
import { Button } from "../ui/button";

/** After Approve (review-queue 4). The countdown is plain text, not motion. */
export function UndoNotice({
  pending,
  onUndo,
  onNext,
  undoRef,
}: {
  pending: PendingApproval;
  onUndo(): void;
  /** Confirms the approval now and moves on; omit to just wait out the window. */
  onNext?(): void;
  undoRef?: Ref<HTMLButtonElement>;
}) {
  const now = useNow(1000);
  const left = Math.max(0, Math.ceil((pending.endsAt - now) / 1000));
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ok/30 bg-ok-wash px-4 py-3.5 text-[13.5px] text-ok-deep"
    >
      <CheckCircle2 aria-hidden className="size-5 shrink-0" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b className="block text-sm">Correction approved</b>
        {correctionTitle(pending.item)}.{" "}
        {pending.item.submitted_by.display_name} will be told, and it goes to
        clinical sign-off before anything changes.
      </div>
      <Button
        ref={undoRef}
        variant="ghost"
        size="sm"
        aria-label="Undo approval"
        onClick={onUndo}
      >
        Undo <span aria-hidden>({left} s)</span>
      </Button>
      {onNext && (
        <Button variant="soft" size="sm" onClick={onNext}>
          Next correction
        </Button>
      )}
    </div>
  );
}
