import type { ReactNode } from "react";
import { cn } from "./cn";

const TONE = {
  brand: "bg-lilac text-bloom",
  ok: "bg-ok-wash text-ok-deep",
  warn: "bg-warn-wash text-warn-deep",
  bad: "bg-bad-wash text-bad-deep",
  mint: "bg-mint-wash text-mint-deep",
} as const;

export function Chip({
  tone = "brand",
  mono,
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        mono && "font-mono",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
