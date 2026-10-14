"use client";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useEscape } from "@/lib/hooks/use-escape";
import { cn } from "./cn";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
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
  const panel = useRef<HTMLElement>(null);
  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => prev?.focus?.();
  }, [open]);

  function trap(e: KeyboardEvent) {
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!panel.current.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={cn("fixed inset-0 z-40", !open && "pointer-events-none")}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/35 transition-opacity duration-[var(--t-base)]",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={trap}
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto rounded-t-[26px] bg-white px-4 pb-6 pt-2.5 shadow-2xl",
          "transition-transform duration-[var(--t-slow)] ease-[var(--e-spring)]",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="mx-auto mb-3 grid min-h-11 w-16 place-items-center"
        >
          <span className="block h-1.5 w-11 rounded-full bg-lilac-2" />
        </button>
        {children}
      </section>
    </div>
  );
}
