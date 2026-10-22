"use client";
import type { RefObject } from "react";
import {
  changeLine,
  followUpLine,
  TOP,
  type RankedChange,
} from "@/lib/analytics/changes";
import { NOT_ENOUGH_TO_COMPARE } from "@/lib/analytics/read";
import { cn } from "@mhai/ui/cn";

/**
 * What changed, ranked: the top 5, then "Show all ({n})". Each row is a
 * button; the selected one has aria-current. The sign always comes with
 * words, never colour alone.
 */
export function ChangesList({
  items,
  selectedId,
  showAll,
  onShowAll,
  onSelect,
  rowRefs,
}: {
  items: RankedChange[];
  selectedId: string | null;
  showAll: boolean;
  onShowAll(): void;
  onSelect(id: string): void;
  /** The row buttons by change id, so Back can return focus to one. */
  rowRefs: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const at = items.findIndex((c) => c.id === selectedId);
  // The selected row is never hidden behind Show all.
  const all = showAll || at >= TOP;
  const shown = all ? items : items.slice(0, TOP);
  return (
    <>
      <ul aria-label="Changes" className="flex flex-col gap-1.5">
        {shown.map((c) => {
          const line = changeLine(c);
          const current = c.id === selectedId;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-current={current ? "true" : undefined}
                ref={(el) => {
                  if (el) rowRefs.current.set(c.id, el);
                  else rowRefs.current.delete(c.id);
                }}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex min-h-11 w-full gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep",
                  current
                    ? "border-mint-deep bg-mint/10"
                    : "border-line bg-white hover:bg-lilac/40",
                  c.followedUp && !current && "text-ink-2",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-px w-4 shrink-0 text-center font-semibold",
                    line.sign === "⚠" ? "text-warn-deep" : "text-ink-2",
                  )}
                >
                  {line.sign}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block [overflow-wrap:anywhere]">
                    {line.words}
                  </span>
                  {!c.comparable && (
                    <span className="mt-0.5 block text-[12.5px] text-ink-3">
                      {NOT_ENOUGH_TO_COMPARE}
                    </span>
                  )}
                  {c.follow_up && (
                    <span className="mt-0.5 block text-[12.5px] text-ink-3">
                      {followUpLine(c.follow_up)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!all && items.length > TOP && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-2 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-mint-deep underline underline-offset-2"
        >
          Show all ({items.length})
        </button>
      )}
    </>
  );
}
