"use client";
import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { StepUp } from "@/lib/api/contract";
import { platformError } from "@/lib/errors";
import { ApiError } from "@mhai/api-client/errors";
import {
  BACKUP_FAILED_BODY,
  BackupCodeInput,
  BackupCodeToggle,
  useCodeOrBackup,
} from "@mhai/ui/auth/backup-code-toggle";
import { CodeInput } from "@mhai/ui/auth/code-input";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Sheet } from "@mhai/ui/sheet";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

const NOTE_MAX = 500;

export type StepUpInput = { reason?: string; note?: string } & StepUp;

export type StepUpDialogProps = {
  open: boolean;
  title: string;
  /** Said first: what the action does. */
  intro?: ReactNode;
  /** A choice of reasons (radios)... */
  reasons?: { code: string; label: string }[];
  reasonLabel?: string;
  /** ...or a reason in the person's own words. */
  freeReason?: boolean;
  /** The reason code that needs a note (e.g. "other"). */
  noteFor?: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  busy: boolean;
  /** The last refusal, as thrown by the client; null when none. */
  error: unknown;
  onClose(): void;
  onConfirm(input: StepUpInput): void;
};

/**
 * An action confirmed with the person's own two-step code (or a backup
 * code): a dialog on desktop, a sheet on phones. Mounted content only while
 * open, so each opening starts empty. The code is never kept here after
 * closing, and the caller's mutation forgets it too (gcTime 0).
 */
export function StepUpDialog(props: StepUpDialogProps) {
  const desktop = useIsDesktop();
  const box = useRef<HTMLDivElement>(null);
  const { open, title, onClose, busy } = props;
  // While a request is out, the dialog stays: the answer is always shown.
  const close = () => {
    if (!busy) onClose();
  };
  // Runs after Dialog's and Sheet's own focus moves: the first field wins.
  useEffect(() => {
    if (!open) return;
    box.current
      ?.querySelector<HTMLElement>("input:not([disabled]), textarea, select")
      ?.focus();
  }, [open, desktop]);
  const form = open ? (
    <div ref={box}>
      <StepUpForm {...props} onClose={close} />
    </div>
  ) : null;
  return desktop ? (
    <Dialog open={open} onClose={close} title={title}>
      {form}
    </Dialog>
  ) : (
    // On the body: a card's backdrop blur would otherwise hold this fixed
    // sheet inside the card instead of the screen. Phones only, so never
    // on the server (which counts as desktop).
    createPortal(
      <Sheet open={open} onClose={close} title={title}>
        <h2 className="mb-3 font-display text-[28px] font-black leading-none">
          {title}
        </h2>
        {form}
      </Sheet>,
      document.body,
    )
  );
}

type Missing = { reason?: string; note?: string; code?: string };

function StepUpForm({
  intro,
  reasons,
  reasonLabel = "Reason",
  freeReason,
  noteFor,
  confirmLabel,
  tone,
  busy,
  error,
  onClose,
  onConfirm,
}: StepUpDialogProps) {
  const id = useId();
  const c = useCodeOrBackup();
  const net = useNeedsConnection(`${id}-offline`);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState<Missing>({});
  const [focusKey, setFocusKey] = useState(0);
  const firstReason = useRef<HTMLInputElement>(null);
  const freeRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  // One confirmation sends one request, even if a second click lands before
  // the caller's busy state renders. Released once the answer comes.
  const sent = useRef(false);
  // Whether the last code sent was a backup code, for the refusal's wording.
  const [usedBackup, setUsedBackup] = useState(false);
  // The refusal already handled, so each new one clears the code once.
  const [seen, setSeen] = useState<unknown>(error);

  useEffect(() => {
    if (!busy) sent.current = false;
  }, [busy, error]);

  // A wrong code: clear it and put the cursor back for the next try.
  const wrong = error instanceof ApiError && error.code === "mfa_invalid";
  if (error !== seen) {
    setSeen(error);
    if (wrong) {
      c.setCode("");
      setFocusKey((k) => k + 1);
    }
  }
  // CodeInput focuses its first box on a new focusKey; the backup box here.
  useEffect(() => {
    if (focusKey && c.backup) backupRef.current?.focus();
  }, [focusKey, c.backup]);

  const words = error ? platformError(error) : null;
  const needsNote = !!noteFor && reason === noteFor;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy || sent.current || net.offline) return;
    const r = reason.trim();
    const n = note.trim();
    const m: Missing = {};
    if ((reasons || freeReason) && !r)
      m.reason = reasons ? "Choose a reason." : "Enter a reason.";
    if (needsNote && !n) m.note = "Add a note.";
    if (!c.ready)
      m.code = c.backup ? "Enter a backup code." : "Enter your 6-digit code.";
    setMissing(m);
    if (m.reason) return (reasons ? firstReason : freeRef).current?.focus();
    if (m.note) return noteRef.current?.focus();
    if (m.code) return setFocusKey((k) => k + 1);
    sent.current = true;
    setUsedBackup(c.backup);
    const code: StepUp = c.backup
      ? { backup_code: c.value }
      : { mfa_code: c.value };
    onConfirm({
      ...(r ? { reason: r } : {}),
      ...(reasons && n ? { note: n } : {}),
      ...code,
    });
  };

  const err = (k: keyof Missing) =>
    missing[k] ? (
      <p id={`${id}-${k}-err`} className="mt-1.5 text-[13px] text-bad">
        {missing[k]}
      </p>
    ) : null;
  const describe = (k: keyof Missing) =>
    missing[k] ? `${id}-${k}-err` : undefined;

  return (
    <form noValidate onSubmit={submit}>
      {intro && (
        <div className="text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
          {intro}
        </div>
      )}
      {reasons && (
        <fieldset aria-describedby={describe("reason")} className="mt-4">
          <legend className="mb-2 text-[13px] font-semibold">
            {reasonLabel} <span aria-hidden>*</span>
            <span className="sr-only">(required)</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r, i) => (
              <label key={r.code} className="cursor-pointer">
                <input
                  ref={i === 0 ? firstReason : undefined}
                  type="radio"
                  name={`${id}-reason`}
                  value={r.code}
                  checked={reason === r.code}
                  disabled={busy}
                  onChange={() => {
                    setReason(r.code);
                    setMissing((p) => ({ ...p, reason: undefined }));
                  }}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-lilac-2 bg-white px-3 text-[12.5px] text-ink-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9">
                  {reason === r.code && (
                    <Check aria-hidden className="size-3.5" />
                  )}
                  {r.label}
                </span>
              </label>
            ))}
          </div>
          {err("reason")}
        </fieldset>
      )}
      {reasons && (
        <div className="mt-3">
          <label
            htmlFor={`${id}-note`}
            className="mb-1.5 block text-[12.5px] text-ink-2"
          >
            Note {needsNote ? "(required)" : "(optional)"}
          </label>
          <textarea
            ref={noteRef}
            id={`${id}-note`}
            rows={2}
            maxLength={NOTE_MAX}
            value={note}
            disabled={busy}
            aria-invalid={missing.note ? true : undefined}
            aria-describedby={describe("note")}
            onChange={(e) => {
              setNote(e.target.value);
              setMissing((p) => ({ ...p, note: undefined }));
            }}
            className={`${inputClass} py-2.5`}
          />
          {err("note")}
        </div>
      )}
      {freeReason && (
        <div className="mt-4">
          <label
            htmlFor={`${id}-reason`}
            className="mb-1.5 block text-[12.5px] text-ink-2"
          >
            {reasonLabel} <span aria-hidden>*</span>
            <span className="sr-only">(required)</span>
          </label>
          <textarea
            ref={freeRef}
            id={`${id}-reason`}
            rows={2}
            maxLength={NOTE_MAX}
            value={reason}
            disabled={busy}
            aria-invalid={missing.reason ? true : undefined}
            aria-describedby={describe("reason")}
            onChange={(e) => {
              setReason(e.target.value);
              setMissing((p) => ({ ...p, reason: undefined }));
            }}
            className={`${inputClass} py-2.5`}
          />
          {err("reason")}
        </div>
      )}
      <div className="mt-4">
        <p className="mb-2 text-[13px]">
          {c.backup
            ? "Enter one of your backup codes to confirm."
            : "Enter the 6-digit code from your authenticator app to confirm."}
        </p>
        {c.backup ? (
          <BackupCodeInput
            id={`${id}-backup`}
            inputRef={backupRef}
            value={c.code}
            onChange={(v) => {
              c.setCode(v);
              setMissing((p) => ({ ...p, code: undefined }));
            }}
            disabled={busy}
          />
        ) : (
          <CodeInput
            value={c.code}
            onChange={(v) => {
              c.setCode(v);
              setMissing((p) => ({ ...p, code: undefined }));
            }}
            label="Your two-step code"
            disabled={busy}
            invalid={wrong || !!missing.code}
            focusKey={focusKey}
          />
        )}
        {err("code")}
        <p className="mt-1 text-[13px] text-ink-3">
          <BackupCodeToggle
            backup={c.backup}
            onChange={(b) => {
              c.setBackup(b);
              setMissing((p) => ({ ...p, code: undefined }));
            }}
          />
        </p>
      </div>
      {words && (
        <div className="mt-3">
          <Banner tone="bad" title={words.title}>
            {wrong && usedBackup ? BACKUP_FAILED_BODY : words.body}
          </Banner>
        </div>
      )}
      <OfflineNote id={`${id}-offline`} />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={tone === "danger" ? "danger" : "primary"}
          disabled={busy}
          {...net.props}
        >
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
