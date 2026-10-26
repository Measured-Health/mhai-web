"use client";
import type { ReactNode } from "react";
import type { AGuarded, Meta } from "@/lib/api/analysis-contract";
import { monthsText, valueText } from "@/lib/analysis/labels";
import { isSmallCount } from "@mhai/ui/small-groups";

// Small pieces the Analysis views share. No hidden value is ever worked out
// from other figures, and no order ever shows a hidden value's size.

/** A number that shows; null when hidden or empty. */
export const shownValue = (g: AGuarded): number | null =>
  g.suppressed || g.value === null ? null : g.value;

/**
 * Hidden under the small-group rule, so a bar writes "Fewer than 5" and
 * draws nothing: the value is hidden (not for too few hospitals) and its
 * count is hidden or 1–4. From the guards, never from the words.
 */
export const isHiddenGroup = (g: AGuarded, count: AGuarded): boolean =>
  g.suppressed &&
  g.why === undefined &&
  ((count.suppressed && count.why === undefined) ||
    (count.value !== null && isSmallCount(count.value)));

/**
 * Largest shown first; anything not shown after, by name, in either case
 * the same, so a hidden row's place says nothing about its size.
 */
export function byShownThenName<T>(
  rows: readonly T[],
  value: (r: T) => number | null,
  name: (r: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x !== null && y !== null && x !== y) return y - x;
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    return name(a).localeCompare(name(b));
  });
}

/** "1,240 patients in the group · Oct 2025 to Sep 2026". */
export function GroupLine({ meta }: { meta: Meta }) {
  return (
    <p className="text-[14px] text-ink-2">
      {valueText(meta.patients, "count")} patients in the group ·{" "}
      {monthsText(meta.period)}
    </p>
  );
}

/** A titled group of figures inside a view. */
export function Block({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}
