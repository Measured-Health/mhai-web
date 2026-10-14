"use client";
import { useRef, type ReactNode } from "react";
import { useEscape } from "@/lib/hooks/use-escape";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { cn } from "./cn";

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

  useFocusTrap(open, panel);

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
        tabIndex={-1}
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
