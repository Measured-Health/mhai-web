import type { ReactNode } from "react";
import { FEWER_THAN_5 } from "@/lib/small-groups";
import { cn } from "../cn";

export interface BarItem {
  key: string;
  label: ReactNode;
  /** Bar length in the list's scale; null draws no bar. */
  value: number | null;
  /** Written beside the bar, e.g. "412" or "62%". */
  text: string;
  /** Under the small-group rule: writes "Fewer than 5" and draws no bar. */
  hidden?: boolean;
  icon?: ReactNode;
  /** Bar colour class; `bg-mint` by default. */
  barClass?: string;
}

/**
 * Horizontal bars with the number always written beside them (the Usage
 * page's style). Knows nothing about what it counts, so Analysis reuses it.
 */
export function BarList({
  items,
  max,
  label,
  empty = "Nothing to show yet.",
  animate = true,
}: {
  items: readonly BarItem[];
  max?: number;
  label?: string;
  empty?: string;
  /** Bars grow in once (not with reduced motion); false for static cards. */
  animate?: boolean;
}) {
  if (!items.length) return <p className="text-[13px] text-ink-3">{empty}</p>;
  const drawn = (i: BarItem) =>
    !i.hidden && i.value !== null && Number.isFinite(i.value);
  const top =
    max ?? Math.max(1, ...items.map((i) => (drawn(i) ? i.value! : 0)));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.key} className="text-[13px]">
          <span className="flex items-center gap-2">
            {i.icon}
            <span className="flex-1 [overflow-wrap:anywhere]">{i.label}</span>
            {i.hidden ? (
              <b className="font-semibold text-ink-2">{FEWER_THAN_5}</b>
            ) : (
              <b className="font-mono">{i.text}</b>
            )}
          </span>
          {drawn(i) && (
            <span
              aria-hidden
              className="mt-1 block h-1.5 rounded-full bg-lilac"
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  animate &&
                    "motion-safe:animate-[grow_var(--t-story)_var(--e-out)_both]",
                  i.barClass ?? "bg-mint",
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, Math.round((i.value! * 100) / top)))}%`,
                }}
              />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
