"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
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
  // The latest initial-focus target, so opening reads it without re-running.
  const first = useRef(initialFocus);
  useEffect(() => {
    first.current = initialFocus;
  });
  useEscape(open, onClose);
  // What had the focus before the dialog opened; it gets it back when the
  // dialog closes or unmounts while open, if it is still on the page. If it
  // has gone, no new focus is set: the caller decides.
  const opener = useRef<HTMLElement | null>(null);
  const giveBack = useRef((d: HTMLDialogElement | null) => {
    if (d?.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected && !d?.contains(back)) back.focus();
  });
  // Layout effects. Closing is handled in the effect body, after React has
  // put back the focus it had before the commit; unmounting in a cleanup,
  // which runs before the <dialog> leaves the page.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!open) {
      giveBack.current(d);
      return;
    }
    const now = document.activeElement;
    opener.current =
      now instanceof HTMLElement && now !== document.body && !d.contains(now)
        ? now
        : null;
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    (
      first.current?.current ??
      d.querySelector<HTMLElement>("button, [href], input, textarea, select")
    )?.focus();
  }, [open]);
  useLayoutEffect(() => {
    const d = ref.current;
    const back = giveBack.current;
    return () => back(d);
  }, []);
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
