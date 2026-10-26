"use client";
import type { ReactNode } from "react";
import type { AGuarded, Meta } from "@/lib/api/analysis-contract";
import { monthsText, valueText } from "@/lib/analysis/labels";
import { isSmallCount } from "@mhai/ui/small-groups";

// Small pieces the Analysis views share. No hidden value is ever worked out
// from other figures, and no order ever shows a hidden value's size.

export { byShownThenName, countValue, shownValue } from "@/lib/analysis/tables";

/**
 * Hidden under the small-group rule with its count hidden too (or 1–4): the
 * bar draws nothing and carries no note. From the guards, never the words.
 */
export const isHiddenGroup = (g: AGuarded, count: AGuarded): boolean =>
  g.suppressed &&
  g.why === undefined &&
  ((count.suppressed && count.why === undefined) ||
    (count.value !== null && isSmallCount(count.value)));

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
