"use client";
import type { ReactNode } from "react";
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
    <Sheet open={open} onClose={onClose} title={title}>
      <h2 className="mb-3 font-display text-[28px] font-black leading-none">
        {title}
      </h2>
      {body}
    </Sheet>
  );
}
