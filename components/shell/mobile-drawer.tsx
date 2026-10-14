"use client";
import { Suspense, useEffect, useRef, type KeyboardEvent } from "react";
import type { SessionItem } from "@/lib/session-store";
import { useEscape } from "@/lib/hooks/use-escape";
import { cn } from "../ui/cn";
import { Sidebar } from "./sidebar";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileDrawer({
  open,
  onClose,
  items,
  onOpenSearch,
}: {
  open: boolean;
  onClose(): void;
  items: SessionItem[];
  onOpenSearch?(): void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => prev?.focus?.();
  }, [open]);

  function trap(e: KeyboardEvent) {
    if (e.key !== "Tab" || !panel.current) return;
    const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];
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
      className={cn(
        "fixed inset-0 z-40 md:hidden",
        !open && "pointer-events-none",
      )}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/35 transition-opacity duration-[var(--t-base)]",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={trap}
        onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}
        className={cn(
          "absolute inset-y-0 left-0 w-[84%] max-w-80 transition-transform duration-[var(--t-slow)] ease-[var(--e-out)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Suspense fallback={null}>
          <Sidebar items={items} onOpenSearch={onOpenSearch} />
        </Suspense>
      </div>
    </div>
  );
}
