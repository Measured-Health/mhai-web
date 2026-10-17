"use client";
import { useRef, type ReactNode } from "react";
import type { AdminError } from "@/lib/admin/errors";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/**
 * A destructive confirmation (spec §7): the safe button comes first and has
 * the focus, even when a field (a two-step code) sits above it. The content
 * is a form, so a code box that submits on its last digit confirms; nothing
 * is confirmed until `ready`.
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
  return (
    <Dialog open={open} onClose={onKeep} title={title} initialFocus={keep}>
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
          <Button ref={keep} variant="ghost" onClick={onKeep}>
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
