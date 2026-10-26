"use client";
import { ArrowDown, ArrowUp, Equal, Info } from "lucide-react";
import { useId } from "react";
import type { Comparison } from "@/lib/api/analysis-contract";
import { comparisonLines } from "@/lib/analysis/labels";

const VERDICT_ICON = {
  higher: ArrowUp,
  lower: ArrowDown,
  about_same: Equal,
} as const;

/**
 * The fair comparison (spec §5.3), One hospital scope only: the context
 * line first, then the hospital's own last period, the median of similar
 * hospitals and the verdict, in words with an icon, never colour alone.
 * When it isn't available, only the context and the reason. `kind` is
 * "rate" (per 1,000) or "share" (Quality's agreement rate).
 */
export function ComparisonPanel({
  comparison,
  kind,
}: {
  comparison: Comparison;
  kind: "rate" | "share";
}) {
  const id = useId();
  const l = comparisonLines(comparison, kind);
  const VerdictIcon = comparison.verdict
    ? VERDICT_ICON[comparison.verdict]
    : null;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-bg px-3.5 py-3"
    >
      <h3 id={id} className="text-[14px] font-semibold">
        Compared with similar hospitals
      </h3>
      <ul className="flex flex-col gap-1 text-[13.5px]">
        <li className="text-ink-2 [overflow-wrap:anywhere]">{l.context}</li>
        {!comparison.available ? (
          l.reason !== null && (
            <li className="flex items-center gap-1.5 font-semibold">
              <Info aria-hidden className="size-4 shrink-0 text-ink-3" />
              {l.reason}
            </li>
          )
        ) : (
          <>
            <li>{l.previous}</li>
            {l.median !== null && <li>{l.median}</li>}
            {l.verdict !== null && VerdictIcon && (
              <li className="flex items-center gap-1.5 font-semibold">
                <VerdictIcon aria-hidden className="size-4 shrink-0" />
                {l.verdict}
              </li>
            )}
          </>
        )}
      </ul>
    </section>
  );
}
