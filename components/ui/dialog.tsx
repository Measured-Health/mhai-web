"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useEscape } from "@/lib/hooks/use-escape";

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEscape(open, onClose);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      d.querySelector<HTMLElement>(
        "button, [href], input, textarea, select",
      )?.focus();
    }
    if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(440px,92vw)] rounded-3xl bg-white p-6 text-ink shadow-[0_40px_80px_-30px_#1c0d22aa] backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <h2
        id={titleId}
        className="mb-2 font-display text-[32px] font-black leading-none"
      >
        {title}
      </h2>
      {children}
    </dialog>
  );
}
