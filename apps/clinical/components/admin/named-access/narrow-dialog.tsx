"use client";
import { useId, useRef, useState } from "react";
import { NARROW_LABEL, NOTE_MAX, type NarrowReason } from "@mhai/ui/clearances";
import { useNetwork } from "@mhai/api-client/network";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import type { ClearanceOut } from "@/lib/api/clearances-contract";
import { isMfaRequired } from "@/lib/admin-queries";
import { useNarrowClearance } from "@/lib/clearance-queries";
import { listNames } from "@/lib/clearances/summary";
import { ConfirmDialog } from "../confirm-dialog";
import { StepUpFields, useStepUp } from "../step-up-fields";
import { ReasonFields, useLetterAnswer } from "./letter-write";

const REASONS = Object.keys(NARROW_LABEL) as NarrowReason[];
export const EVERYONE_TEXT = "To remove everyone, revoke the letter";

type Person = { id: string; label: string; name: string };

/** Everyone the letter covers: hospital staff, then Measured Health staff. */
const peopleOn = (c: ClearanceOut): Person[] => [
  ...c.covered.map((p) => ({
    id: p.id,
    label: p.display_name,
    name: p.display_name,
  })),
  ...c.covered_platform.map((p) => ({
    id: p.id,
    label: `${p.display_name} (Measured Health)`,
    name: p.display_name,
  })),
];

/**
 * Remove people from a letter: who, a reason, a note (needed for Other) and
 * the admin's two-step code. Narrowing only removes people, never all of
 * them: that is a revocation, offered instead. It sends the letter's
 * version; if someone else changed it first, the answer is "Changed by
 * someone else" and the letter loads again (Review Focus 5). Mounted only
 * while open: closing forgets the code.
 */
export function NarrowDialog({
  letter,
  onClose,
  onRevokeInstead,
}: {
  letter: ClearanceOut;
  onClose(): void;
  onRevokeInstead(): void;
}) {
  const narrow = useNarrowClearance();
  const toast = useToast();
  const { online } = useNetwork();
  const step = useStepUp();
  const answer = useLetterAnswer(step);
  const everyoneId = useId();
  const sending = useRef(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState<NarrowReason | null>(null);
  const [note, setNote] = useState("");

  // The letter as it is now: after a reload, anyone already gone drops out.
  const people = peopleOn(letter);
  const remove = picked.filter((id) => people.some((p) => p.id === id));
  const everyone = remove.length > 0 && remove.length >= people.length;
  const noteNeeded = reason === "other" && note.trim() === "";
  const ready =
    remove.length > 0 &&
    !everyone &&
    reason !== null &&
    !noteNeeded &&
    note.length <= NOTE_MAX &&
    step.ready &&
    !answer.blocked;
  const busy = narrow.isPending;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name;

  const keep = () => {
    if (busy) return;
    narrow.reset();
    onClose();
  };

  function confirm() {
    if (!ready || !reason || sending.current) return;
    sending.current = true;
    answer.clear();
    const auth = step.auth();
    const text = note.trim();
    const names = remove.map((id) => nameOf(id) ?? "Someone");
    narrow.mutate(
      {
        id: letter.id,
        body: {
          remove,
          reason,
          ...(text ? { note: text } : {}),
          version: letter.version,
          ...auth,
        },
      },
      {
        onSuccess: () => {
          toast.show({
            title: "Removed from the letter",
            body: `${listNames(names)} no longer ${names.length === 1 ? "has" : "have"} named access under it.`,
            tone: "ok",
          });
          answer.spent(auth);
          narrow.reset();
          onClose();
        },
        onError: (e) => {
          if (isMfaRequired(e)) answer.require();
          answer.refused(e, nameOf);
        },
        onSettled: (_d, e) => {
          sending.current = false;
          // Forget the call, and with it the spent code.
          if (e) narrow.reset();
        },
      },
    );
  }

  const toggle = (id: string) => {
    answer.clear();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <ConfirmDialog
      open
      title="Remove people from this letter?"
      keepLabel="Keep everyone"
      confirmLabel="Remove"
      onKeep={keep}
      onConfirm={confirm}
      busy={busy}
      error={answer.error}
      offline={!online}
      ready={ready}
    >
      <p>
        Their named access under this letter ends at once. Everyone else keeps
        it.
      </p>
      <fieldset className="mt-4 text-ink">
        <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
          Who to remove
        </legend>
        {people.map((p) => (
          <label key={p.id} className="flex min-h-11 items-center gap-2.5">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-mint"
              checked={remove.includes(p.id)}
              disabled={busy}
              aria-describedby={everyone ? everyoneId : undefined}
              onChange={() => toggle(p.id)}
            />
            <span className="[overflow-wrap:anywhere]">{p.label}</span>
          </label>
        ))}
      </fieldset>
      {everyone && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p
            id={everyoneId}
            role="alert"
            className="text-[13px] font-semibold text-bad-deep"
          >
            {EVERYONE_TEXT}
          </p>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onRevokeInstead}
          >
            Revoke the letter instead
          </Button>
        </div>
      )}
      <ReasonFields
        legend="Why are you removing them?"
        labels={NARROW_LABEL}
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
        blockedTitle="Turn on two-step verification in Profile & security to change a letter."
        onToggle={answer.clear}
        autoSubmit={false}
      />
    </ConfirmDialog>
  );
}
