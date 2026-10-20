"use client";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@mhai/ui/cn";

/** A filter toggle. The selected one shows a check, never colour alone. */
export function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-8",
        pressed ? "bg-ink text-white" : "bg-lilac text-bloom",
      )}
    >
      {pressed && <Check aria-hidden className="size-3.5" />}
      {children}
    </button>
  );
}
