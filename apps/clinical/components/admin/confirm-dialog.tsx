"use client";
import { useRef, type ReactNode } from "react";
import type { AdminError } from "@/lib/admin/errors";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

/**
 * A destructive confirmation (spec §7): the safe button comes first and has
 * the focus, even when a field (a two-step code) sits above it. The content
 * is a form, so a code box that submits on its last digit confirms; nothing
 * is confirmed until `ready`. While `busy` it stays open (no Keep, no Esc),
 * so the answer is always shown.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  keepLabel,
  confirmLabel,
  onKeep,
  onConfirm,
  busy,
  error,
  offline,
  ready = true,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  keepLabel: string;
  confirmLabel: string;
  onKeep(): void;
  onConfirm(): void;
  busy: boolean;
  error: AdminError | null;
  offline: boolean;
  /** False until what the confirmation needs (e.g. a full code) is entered. */
  ready?: boolean;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  const can = ready && !busy && !offline;
  const close = () => {
    if (!busy) onKeep();
  };
  return (
    <Dialog open={open} onClose={close} title={title} initialFocus={keep}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (can) onConfirm();
        }}
      >
        <div className="text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
          {children}
        </div>
        {offline && (
          <p className="mt-3 text-[13px] text-ink-3">
            You&apos;re offline. This needs a connection.
          </p>
        )}
        {error && (
          <div className="mt-3">
            <Banner tone="bad" title={error.title}>
              {error.body}
            </Banner>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button ref={keep} variant="ghost" disabled={busy} onClick={close}>
            {keepLabel}
          </Button>
          <Button type="submit" variant="danger" disabled={!can}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
