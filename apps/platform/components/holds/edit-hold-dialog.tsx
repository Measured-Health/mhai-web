"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { LegalHold } from "@/lib/api/holds-contract";
import { platformError, type PlatformErrorWords } from "@/lib/errors";
import { HOLD_HINT } from "@/lib/holds/labels";
import { NOTE_MAX, validateEdit, type EditForm } from "@/lib/holds/rules";
import { useEditHold } from "@/lib/queries/holds";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Modal } from "../team/modal";

/**
 * Edit a hold: only the review date and the note (what it covers, the
 * reason and the reference never change). No step-up. The save sends the
 * version the edit started from; a clash says "Changed by someone else" and
 * Reload shows theirs, dropping these edits.
 */
export function EditHoldDialog({
  open,
  hold,
  onClose,
  onReload,
}: {
  open: boolean;
  hold: LegalHold;
  onClose(): void;
  /** Refetches the hold (after a clash, or when it's gone). */
  onReload(): void;
}) {
  return (
    <Modal open={open} title="Edit the legal hold" onClose={onClose}>
      <EditForm hold={hold} onClose={onClose} onReload={onReload} />
    </Modal>
  );
}

type Errors = ReturnType<typeof validateEdit>;

function EditForm({
  hold,
  onClose,
  onReload,
}: {
  hold: LegalHold;
  onClose(): void;
  onReload(): void;
}) {
  const id = useId();
  const toast = useToast();
  const net = useNeedsConnection(`${id}-offline`);
  const save = useEditHold(hold.id);
  // What the edit started from: a refetch underneath never changes what
  // this save claims to replace.
  const [start] = useState(() => ({
    version: hold.version,
    review_on: hold.review_on,
    reason: hold.reason,
    note: hold.note ?? "",
  }));
  const [f, setF] = useState<EditForm>({
    review_on: start.review_on,
    note: start.note,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<PlatformErrorWords | null>(null);
  // Someone else changed it: the words, and Reload.
  const [stale, setStale] = useState<PlatformErrorWords | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [focus, setFocus] = useState<{ k: keyof EditForm } | null>(null);
  useEffect(() => {
    if (focus) (focus.k === "note" ? noteRef : dateRef).current?.focus();
  }, [focus]);

  const set = (k: keyof EditForm, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending || net.offline || stale) return;
    setFailure(null);
    const errs = validateEdit(f, start);
    setErrors(errs);
    const first = (["review_on", "note"] as const).find((k) => errs[k]);
    if (first) return setFocus({ k: first });
    const note = f.note.trim();
    save.mutate(
      {
        ...(f.review_on !== start.review_on ? { review_on: f.review_on } : {}),
        ...(note !== start.note.trim() ? { note: note || null } : {}),
        version: start.version,
      },
      {
        onSuccess: () => {
          toast.show({ title: "Hold saved", tone: "ok", live: "polite" });
          onClose();
        },
        onError: (err) => {
          const w = platformError(err);
          if (w.stale) return setStale(w);
          if (w.gone) {
            onClose();
            return onReload();
          }
          setFailure(w);
        },
      },
    );
  };

  const describe = (k: keyof EditForm, hint?: boolean) =>
    [hint && `${id}-${k}-hint`, errors[k] && `${id}-${k}-err`]
      .filter(Boolean)
      .join(" ") || undefined;
  const err = (k: keyof EditForm) =>
    errors[k] ? (
      <p id={`${id}-${k}-err`} className="mt-1.5 text-[13px] text-bad">
        {errors[k]}
      </p>
    ) : null;
  const label = "mb-1.5 block text-[12.5px] text-ink-2";

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {stale && (
        <Banner tone="warn" title={stale.title}>
          <p>{stale.body}</p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              onClose();
              onReload();
            }}
          >
            Reload
          </Button>
        </Banner>
      )}
      {failure && (
        <Banner tone="bad" title={failure.title}>
          {failure.body || "Nothing was saved."}
        </Banner>
      )}
      <div>
        <label htmlFor={`${id}-review_on`} className={label}>
          Review date <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          ref={dateRef}
          id={`${id}-review_on`}
          type="date"
          value={f.review_on}
          aria-invalid={errors.review_on ? true : undefined}
          aria-describedby={describe("review_on")}
          onChange={(e) => set("review_on", e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-[12.5px] text-ink-3">
          The hold shows Review due on this date. Nothing else happens.
        </p>
        {err("review_on")}
      </div>
      <div>
        <label htmlFor={`${id}-note`} className={label}>
          Note {start.reason === "other" ? "(required)" : "(optional)"}
        </label>
        <textarea
          ref={noteRef}
          id={`${id}-note`}
          rows={3}
          maxLength={NOTE_MAX}
          value={f.note}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={describe("note", true)}
          onChange={(e) => set("note", e.target.value)}
          className={`${inputClass} py-2.5`}
        />
        <p id={`${id}-note-hint`} className="mt-1 text-[12.5px] text-ink-3">
          {HOLD_HINT}
        </p>
        {err("note")}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" disabled={save.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={save.isPending || !!stale}
          {...net.props}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <OfflineNote id={`${id}-offline`} />
    </form>
  );
}
