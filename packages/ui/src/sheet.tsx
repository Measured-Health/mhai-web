"use client";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useEscape } from "./hooks/use-escape";
import { useFocusTrap } from "./hooks/use-focus-trap";
import { modalDialogOpen } from "./hooks/modal-dialog";
import { cn } from "./cn";

/**
 * A bottom sheet. With `side="right"` it is a side panel from `md` (a bottom
 * sheet below it), mounted only while open, with a visible Close button.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: "bottom" | "right";
}) {
  const panel = useRef<HTMLElement>(null);
  const right = side === "right";
  // Esc belongs to a modal dialog opened on top of a side panel, if any.
  useEscape(open, () => {
    if (right && modalDialogOpen()) return;
    onClose();
  });

  useFocusTrap(open, panel);

  if (right && !open) return null;

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
          "absolute inset-x-0 bottom-0 overflow-auto rounded-t-[26px] bg-white px-4 pb-6 shadow-2xl",
          right
            ? "max-h-[88dvh] pt-3 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-[26px] md:px-6 md:pt-5"
            : "max-h-[80vh] pt-2.5 transition-transform duration-[var(--t-slow)] ease-[var(--e-spring)]",
          !right && (open ? "translate-y-0" : "translate-y-full"),
        )}
      >
        {right ? (
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto grid size-11 place-items-center rounded-xl text-ink-3 hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : (
          <button
            aria-label="Close"
            onClick={onClose}
            className="mx-auto mb-3 grid min-h-11 w-16 place-items-center"
          >
            <span className="block h-1.5 w-11 rounded-full bg-lilac-2" />
          </button>
        )}
        {children}
      </section>
    </div>
  );
}
