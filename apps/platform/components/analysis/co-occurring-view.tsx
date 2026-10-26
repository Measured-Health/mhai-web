"use client";
import type { ReactNode } from "react";
import type { CoOccurringData } from "@/lib/api/analysis-contract";
import { NOT_STANDARDISED, valueText } from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import {
  PAIRS_TITLE,
  countValue,
  pairKey,
  pairShareLabel,
  pairText,
  sortPairs,
  viewTables,
} from "@/lib/analysis/tables";
import { BarList } from "@mhai/ui/charts/bar-list";
import type { BarItem } from "@mhai/ui/charts/types";
import { SpecTables } from "./data-table";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { GroupLine } from "./view-parts";

export { PAIRS_TITLE };
export const PAIRS_NOTE =
  "Pairs are counted within each hospital, then added up";

type Pair = CoOccurringData["pairs"][number];

/**
 * "62% of people with Type 2 diabetes"; a share that reads in words reads
 * "Share of people with Type 2 diabetes: Not shown".
 */
function shareNote(p: Pair): string {
  const g = p.share_of_a;
  const words = g.suppressed || g.value === null;
  const name = p.a.name ?? NOT_STANDARDISED;
  return words
    ? `${pairShareLabel(p)}: ${valueText(g, "share")}`
    : `${valueText(g, "share")} of people with ${name}`;
}

function barOf(p: Pair): BarItem {
  const n = countValue(p.patients);
  return {
    key: pairKey(p),
    label: pairText(p),
    value: n,
    text: valueText(p.patients, "count"),
    // "Fewer than 5" with no bar; too few hospitals reads its own words.
    hidden: n === null && p.patients.why === undefined,
    note: n === null ? undefined : shareNote(p),
  };
}

/**
 * Co-occurring conditions (spec §4.5): up to 20 pairs by patients, each
 * with the share of people with the first condition. Hidden pairs read
 * "Fewer than 5" and come last, by name. No comparison.
 */
export function CoOccurringView({
  state,
  onRetry,
  mode,
  onMode,
}: {
  state: ViewRead<"co-occurring"> | undefined;
  onRetry(): void;
  mode: ChartOrTable;
  onMode(m: ChartOrTable): void;
}) {
  const ok = state?.status === "ok" ? state.data : null;
  let body: { summary: ReactNode; chart: ReactNode; table: ReactNode } | null =
    null;
  if (ok) {
    body = {
      summary: (
        <>
          <GroupLine meta={ok} />
          <p className="text-[13px] text-ink-3">{PAIRS_NOTE}</p>
        </>
      ),
      chart: (
        <BarList
          label={PAIRS_TITLE}
          items={sortPairs(ok.data.pairs).map(barOf)}
          empty="No pairs to show."
        />
      ),
      table: <SpecTables tables={viewTables("co-occurring", ok)} />,
    };
  }
  return (
    <ViewFrame
      view="co-occurring"
      state={state}
      onRetry={onRetry}
      mode={mode}
      onMode={onMode}
      {...body}
    />
  );
}
