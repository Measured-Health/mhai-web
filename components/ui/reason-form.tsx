"use client";
import { Check } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { Banner } from "./banner";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";

export type ReasonProps<C extends string> = {
  open: boolean;
  onClose(): void;
  /** The title on desktop, and the one on phones. */
  dialogTitle: string;
  sheetTitle: string;
  reasons: readonly { code: C; label: string }[];
  noteMax: number;
  submitLabel: string;
  /** "bad" for refusing someone's work; "plain" for a neutral choice. */
  tone?: "bad" | "plain";
  /** Said above everything else. */
  intro?: ReactNode;
  /** Someone else decided while the form was open. */
  gone: boolean;
  goneTitle: string;
  goneBody: string;
  busy: boolean;
  /** A save that failed, shown in the form. */
  failure: { title: string; body: string } | null;
  /** Small print next to the buttons. */
  footnote?: ReactNode;
  /** Small print under the note, beside the counter. */
  noteHint?: string;
  onSubmit(reason: C, note: string | undefined): void;
};

const CHIP = {
  bad: {
    legend: "text-bad-deep",
    chip: "border-bad-line text-bad-deep peer-checked:border-bad peer-checked:bg-bad",
  },
  plain: {
    legend: "",
    chip: "border-lilac-2 text-ink-2 peer-checked:border-ink peer-checked:bg-ink",
  },
};

/**
 * A reason picker with an optional note: a dialog on desktop, a sheet on
 * phones. Shared by Reject and Dismiss, so both behave the same.
 */
export function ReasonDialog<C extends string>(props: ReasonProps<C>) {
  const desktop = useIsDesktop();
  // Mounted only while open, so each opening starts empty.
  const form = props.open ? <ReasonForm {...props} /> : null;
  return desktop ? (
    <Dialog open={props.open} onClose={props.onClose} title={props.dialogTitle}>
      {form}
    </Dialog>
  ) : (
    <Sheet open={props.open} onClose={props.onClose} title={props.sheetTitle}>
      <h2 className="mb-3 font-display text-[28px] font-black leading-none">
        {props.sheetTitle}
      </h2>
      {form}
    </Sheet>
  );
}

function ReasonForm<C extends string>({
  onClose,
  reasons,
  noteMax,
  submitLabel,
  tone = "plain",
  intro,
  gone,
  goneTitle,
  goneBody,
  busy,
  failure,
  footnote,
  noteHint,
  onSubmit,
}: ReasonProps<C>) {
  const [code, setCode] = useState<C | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
  const t = CHIP[tone];
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (gone || busy) return;
        if (!code) {
          setMissing(true);
          first.current?.focus();
          return;
        }
        const n = note.trim();
        onSubmit(code, n || undefined);
      }}
    >
      {intro}
      {gone && (
        <div className={intro ? "mt-3" : undefined}>
          <Banner tone="warn" title={goneTitle}>
            {goneBody}
          </Banner>
        </div>
      )}
      <fieldset
        aria-describedby={missing ? `${id}-err` : undefined}
        className="mt-3"
      >
        <legend className={`mb-2 text-[13px] font-semibold ${t.legend}`}>
          Reason <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r, i) => (
            <label key={r.code} className="cursor-pointer">
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name={`${id}-reason`}
                value={r.code}
                checked={code === r.code}
                onChange={() => {
                  setCode(r.code);
                  setMissing(false);
                }}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-11 items-center gap-1.5 rounded-full border bg-white px-3 text-[12.5px] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9 ${t.chip}`}
              >
                {code === r.code && <Check aria-hidden className="size-3.5" />}
                {r.label}
              </span>
            </label>
          ))}
        </div>
        {missing && (
          <p id={`${id}-err`} className="mt-1.5 text-xs text-bad">
            ✕ Choose a reason.
          </p>
        )}
      </fieldset>
      <label
        htmlFor={`${id}-note`}
        className="mb-1.5 mt-3 block text-[12.5px] text-ink-2"
      >
        Note (optional)
      </label>
      <textarea
        id={`${id}-note`}
        rows={3}
        maxLength={noteMax}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-describedby={noteHint ? `${id}-note-hint` : undefined}
        className="w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none [overflow-wrap:anywhere] focus:border-mint focus:ring-4 focus:ring-mint/15"
      />
      <p className="mt-1 flex justify-between gap-3 text-[11px] text-ink-3">
        <span id={`${id}-note-hint`}>{noteHint}</span>
        <span className="ml-auto font-mono">
          {note.length} / {noteMax}
        </span>
      </p>
      {failure && !gone && (
        <div className="mt-2">
          <Banner tone="bad" title={failure.title}>
            {failure.body}
          </Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" disabled={busy || gone}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {footnote && (
          <span className="ml-auto text-xs text-ink-3">{footnote}</span>
        )}
      </div>
    </form>
  );
}
