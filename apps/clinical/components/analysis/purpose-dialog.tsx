"use client";
import { useId, useRef, useState } from "react";
import type { NamedPurpose } from "@/lib/api/analysis-contract";
import { PURPOSE_LABEL, PURPOSE_NOTE_MAX } from "@/lib/analysis/named";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

const PURPOSES = Object.keys(PURPOSE_LABEL) as NamedPurpose[];

/**
 * Why names are needed, asked each time names are shown: one purpose, and a
 * note (needed for Other). A modal dialog at every width, so it never
 * stacks a sheet on the patients sheet (ruling 13). Nothing is kept after
 * it closes.
 */
export function PurposeDialog({
  open,
  online,
  onClose,
  onSubmit,
}: {
  open: boolean;
  online: boolean;
  onClose(): void;
  onSubmit(purpose: NamedPurpose, note: string | undefined): void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Show names">
      {open && (
        <PurposeForm online={online} onClose={onClose} onSubmit={onSubmit} />
      )}
    </Dialog>
  );
}

function PurposeForm({
  online,
  onClose,
  onSubmit,
}: {
  online: boolean;
  onClose(): void;
  onSubmit(purpose: NamedPurpose, note: string | undefined): void;
}) {
  const [purpose, setPurpose] = useState<NamedPurpose | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<"purpose" | "note" | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const needsNote = purpose === "other";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!online) return;
        if (!purpose) {
          setProblem("purpose");
          first.current?.focus();
          return;
        }
        const text = note.trim();
        if (needsNote && !text) {
          setProblem("note");
          noteRef.current?.focus();
          return;
        }
        onSubmit(purpose, text || undefined);
      }}
    >
      <p className="text-[13.5px] text-ink-2">
        Names and record numbers show for up to an hour. This view is recorded
        with your purpose.
      </p>
      <fieldset
        aria-describedby={problem === "purpose" ? `${id}-purpose` : undefined}
        className="mt-3"
      >
        <legend className="mb-2 text-[13px] font-semibold">
          Purpose <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="flex flex-col gap-1">
          {PURPOSES.map((p, i) => (
            <label
              key={p}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px]"
            >
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name={`${id}-purpose`}
                value={p}
                checked={purpose === p}
                onChange={() => {
                  setPurpose(p);
                  setProblem(null);
                }}
                className="size-4 accent-mint-deep"
              />
              {PURPOSE_LABEL[p]}
            </label>
          ))}
        </div>
        {problem === "purpose" && (
          <p id={`${id}-purpose`} className="mt-1.5 text-xs text-bad">
            ✕ Choose a purpose.
          </p>
        )}
      </fieldset>
      <label
        htmlFor={`${id}-note`}
        className="mb-1.5 mt-3 block text-[12.5px] text-ink-2"
      >
        {needsNote ? "Note (required for Other)" : "Note (optional)"}
      </label>
      <textarea
        ref={noteRef}
        id={`${id}-note`}
        rows={3}
        maxLength={PURPOSE_NOTE_MAX}
        value={note}
        required={needsNote}
        aria-invalid={problem === "note" || undefined}
        aria-describedby={problem === "note" ? `${id}-note-err` : undefined}
        onChange={(e) => {
          setNote(e.target.value);
          if (problem === "note") setProblem(null);
        }}
        className="w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none [overflow-wrap:anywhere] focus:border-mint focus:ring-4 focus:ring-mint/15"
      />
      <p className="mt-1 flex justify-between gap-3 text-[11px] text-ink-3">
        {problem === "note" ? (
          <span id={`${id}-note-err`} className="text-xs text-bad">
            ✕ Add a note for Other.
          </span>
        ) : (
          <span />
        )}
        <span className="ml-auto font-mono">
          {note.length} / {PURPOSE_NOTE_MAX}
        </span>
      </p>
      {!online && (
        <p id={`${id}-offline`} className="mt-2 text-[13px] text-ink-3">
          You&apos;re offline. Reconnect to show names.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={!online}
          aria-describedby={online ? undefined : `${id}-offline`}
        >
          Show names
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
