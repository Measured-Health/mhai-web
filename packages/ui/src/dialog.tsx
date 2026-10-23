"use client";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useEscape } from "./hooks/use-escape";
import { cn } from "./cn";

export function Dialog({
  open,
  onClose,
  title,
  children,
  initialFocus,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * Gets the focus on open, e.g. the safe button of a destructive dialog
   * that has a field above it. Otherwise the first control does.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Classes for the dialog, e.g. a wider frame and `print:hidden`. When
   * given, they replace the default width, so they must set their own.
   */
  className?: string;
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
      (
        initialFocus?.current ??
        d.querySelector<HTMLElement>("button, [href], input, textarea, select")
      )?.focus();
    }
    if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open, initialFocus]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto rounded-3xl bg-white p-6 text-ink shadow-[0_40px_80px_-30px_#1c0d22aa] backdrop:bg-ink/40 backdrop:backdrop-blur-sm",
        className || "w-[min(440px,92vw)]",
      )}
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
