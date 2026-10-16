"use client";
import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { RejectIn, RejectReasonCode } from "@/lib/api/contract";
import {
  NOTE_MAX,
  REJECT_REASONS,
  type DecisionError,
} from "@/lib/corrections";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Sheet } from "../ui/sheet";

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
export function RejectDialog(props: Props) {
  const desktop = useIsDesktop();
  // Mounted only while open, so each opening starts empty.
  const form = props.open ? <RejectForm {...props} /> : null;
  return desktop ? (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Why are you rejecting this?"
    >
      {form}
    </Dialog>
  ) : (
    <Sheet open={props.open} onClose={props.onClose} title="Why reject this?">
      <h2 className="mb-3 font-display text-[28px] font-black leading-none">
        Why reject this?
      </h2>
      {form}
    </Sheet>
  );
}

function RejectForm({
  onClose,
  submitter,
  gone,
  busy,
  error,
  onSubmit,
}: Props) {
  const [code, setCode] = useState<RejectReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
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
        onSubmit(n ? { reason_code: code, note: n } : { reason_code: code });
      }}
    >
      {gone && (
        <Banner
          tone="warn"
          title="Another clinician has already decided this correction"
        >
          Nothing you write here will be sent. Close this and carry on with the
          next one.
        </Banner>
      )}
      <fieldset
        aria-describedby={missing ? `${id}-err` : undefined}
        className="mt-3"
      >
        <legend className="mb-2 text-[13px] font-semibold text-bad-deep">
          Reason <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((r, i) => (
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
              <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-bad-line bg-white px-3 text-[12.5px] text-bad-deep peer-checked:border-bad peer-checked:bg-bad peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9">
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
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none [overflow-wrap:anywhere] focus:border-mint focus:ring-4 focus:ring-mint/15"
      />
      <p className="mt-1 text-right font-mono text-[11px] text-ink-3">
        {note.length} / {NOTE_MAX}
      </p>
      {error && !gone && (
        <div className="mt-2">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" disabled={busy || gone}>
          Reject with reason
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-ink-3">
          {submitter} will see your reason.
        </span>
      </div>
    </form>
  );
}
