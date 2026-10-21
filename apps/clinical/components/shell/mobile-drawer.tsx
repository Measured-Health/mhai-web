"use client";
import { Suspense, useRef } from "react";
import type { SessionItem } from "@/lib/session-store";
import { useEscape } from "@mhai/ui/hooks/use-escape";
import { useFocusTrap } from "@mhai/ui/hooks/use-focus-trap";
import { cn } from "@mhai/ui/cn";
import { Sidebar } from "./sidebar";

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

  useFocusTrap(open, panel);

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
        tabIndex={-1}
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
