"use client";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Dialog } from "@mhai/ui/dialog";
import { Sheet } from "@mhai/ui/sheet";

/** A dialog on desktop, a sheet on phones; content mounts only while open. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  const body = open ? children : null;
  return desktop ? (
    <Dialog open={open} onClose={onClose} title={title}>
      {body}
    </Dialog>
  ) : (
    // On the body: a card's backdrop blur would otherwise hold this fixed
    // sheet inside the card instead of the screen. Phones only, so never
    // on the server (which counts as desktop).
    createPortal(
      <Sheet open={open} onClose={onClose} title={title}>
        <h2 className="mb-3 font-display text-[28px] font-black leading-none">
          {title}
        </h2>
        {body}
      </Sheet>,
      document.body,
    )
  );
}
