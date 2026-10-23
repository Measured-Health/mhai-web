"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { adminError } from "@/lib/admin/errors";
import type { AlertSettingsPatchIn } from "@/lib/api/emr-contract";
import { ApiError } from "@/lib/api/errors";
import { useUpdateAlertSettings } from "@/lib/emr-queries";
import { useOnline } from "@mhai/ui/hooks/use-online";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";

export const NO_RECIPIENTS =
  "Choose the hospital queue, at least one clinician, or both.";
export const CHANGED_BY_SOMEONE = "Changed by someone else";

interface Status {
  text: string;
  conflict: boolean;
}

/**
 * One section's save: its own mutation and status line. After any action the
 * focus moves to the status line, so the result is read out.
 */
export function useSectionSave() {
  const mutation = useUpdateAlertSettings();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);

  return {
    status,
    pending: mutation.isPending,
    say: (text: string) => setStatus({ text, conflict: false }),
    clear: () => setStatus(null),
    send(patch: AlertSettingsPatchIn, onSaved: () => void) {
      setStatus(null);
      mutation.mutate(patch, {
        onSuccess: () => {
          onSaved();
          toast.show({ title: "Alert settings saved.", tone: "ok" });
          setStatus({ text: "Saved", conflict: false });
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409)
            setStatus({ text: CHANGED_BY_SOMEONE, conflict: true });
          else if (e instanceof ApiError && e.code === "no_recipients")
            setStatus({ text: NO_RECIPIENTS, conflict: false });
          else {
            const err = adminError(e);
            setStatus({ text: `${err.title}. ${err.body}`, conflict: false });
          }
        },
      });
    },
  };
}

export type SectionSave = ReturnType<typeof useSectionSave>;

/** A settings section: its fields, Save and Discard, and a status line. */
export function SectionCard({
  title,
  intro,
  dirty,
  blocked = null,
  save,
  onSave,
  onDiscard,
  onReload,
  children,
}: {
  title: string;
  intro?: ReactNode;
  dirty: boolean;
  /** Why Save can't be used even though something changed. */
  blocked?: string | null;
  save: SectionSave;
  onSave(): void;
  onDiscard(): void;
  onReload(): void;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  const online = useOnline();
  const hint = !online
    ? "You're offline. This needs a connection."
    : dirty
      ? blocked
      : null;
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3
        id={id}
        className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint"
      >
        {title}
      </h3>
      {intro}
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={!dirty || !!blocked || !online || save.pending}
          aria-describedby={hint ? hintId : undefined}
          onClick={onSave}
        >
          {save.pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          disabled={!dirty || save.pending}
          onClick={onDiscard}
        >
          Discard
        </Button>
        {hint && (
          <p id={hintId} className="text-[12.5px] text-ink-3">
            {hint}
          </p>
        )}
      </div>
      <StatusLine status={save.status} onReload={onReload} />
    </section>
  );
}

function StatusLine({
  status,
  onReload,
}: {
  status: Status | null;
  onReload(): void;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  // Every new status (each is a new object) moves the focus here.
  useEffect(() => {
    if (status) ref.current?.focus();
  }, [status]);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
      <p
        ref={ref}
        role="status"
        tabIndex={-1}
        className="min-h-5 rounded text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-mint-deep"
      >
        {status?.text}
      </p>
      {status?.conflict && (
        <Button size="sm" variant="ghost" onClick={onReload}>
          Reload
        </Button>
      )}
    </div>
  );
}
