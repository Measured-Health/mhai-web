import type { ComponentProps } from "react";
import { cn } from "./cn";

const VARIANT = {
  primary:
    "bg-gradient-to-br from-mint to-mint-deep text-white shadow-[0_14px_28px_-12px_var(--color-mint)]",
  agree: "bg-bloom text-white",
  soft: "bg-lilac text-bloom",
  ghost: "bg-white border border-line text-ink-2",
  danger: "bg-white border border-bad-line text-bad",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof VARIANT;
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
        "transition-[transform,filter] duration-[var(--t-instant)] ease-[var(--e-out)] active:scale-[.96] hover:brightness-105",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep disabled:opacity-40 disabled:pointer-events-none",
        size === "md"
          ? "min-h-11 px-5 text-sm"
          : "min-h-11 px-3.5 text-[13px] sm:min-h-9",
        VARIANT[variant],
        className,
      )}
    />
  );
}
