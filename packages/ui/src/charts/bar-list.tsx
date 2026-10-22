import type { BarItem } from "./types";
import { FEWER_THAN_5 } from "../small-groups";
import { cn } from "@mhai/ui/cn";

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
    max !== undefined && Number.isFinite(max) && max > 0
      ? max
      : Math.max(1, ...items.map((i) => (drawn(i) ? i.value! : 0)));
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
          {i.note && !i.hidden && (
            <span className="mt-0.5 block text-[12px] text-ink-2 [overflow-wrap:anywhere]">
              {i.note}
            </span>
          )}
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
