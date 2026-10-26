"use client";
import type { ReactNode } from "react";
import type {
  CoOccurringData,
  ConditionRef,
} from "@/lib/api/analysis-contract";
import {
  NOT_STANDARDISED,
  hiddenBeside,
  valueText,
} from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { BarList } from "@mhai/ui/charts/bar-list";
import type { BarItem } from "@mhai/ui/charts/types";
import { isSmallCount } from "@mhai/ui/small-groups";
import { DataTable } from "./data-table";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { GroupLine, byShownThenName, shownValue } from "./view-parts";

export const PAIRS_TITLE = "Pairs of conditions";
export const PAIRS_NOTE =
  "Pairs are counted within each hospital, then added up";

type Pair = CoOccurringData["pairs"][number];

const nameOf = (c: ConditionRef) => c.name ?? NOT_STANDARDISED;
/** "Type 2 diabetes + Hypertension". */
const pairText = (p: Pair) => `${nameOf(p.a)} + ${nameOf(p.b)}`;
/** The pair's patients as a number that shows; null when it reads in words. */
const pairCount = (p: Pair) => {
  const n = shownValue(p.patients);
  return n === null || isSmallCount(n) ? null : n;
};

/** "62% of people with Type 2 diabetes", or "Not shown of people with …". */
const shareNote = (p: Pair) =>
  `${hiddenBeside(p.share_of_a, p.patients) ?? valueText(p.share_of_a, "share")} of people with ${nameOf(p.a)}`;

function barOf(p: Pair): BarItem {
  const n = pairCount(p);
  return {
    key: `${p.a.id}|${p.b.id}`,
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
    const pairs = byShownThenName(
      ok.data.pairs.slice(0, 20),
      pairCount,
      pairText,
    );
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
          items={pairs.map(barOf)}
          empty="No pairs to show."
        />
      ),
      table: (
        <DataTable
          caption={PAIRS_TITLE}
          columns={[
            { key: "pair", label: "Pair" },
            { key: "patients", label: "Patients", numeric: true },
            {
              key: "share",
              label: "Share of people with the first",
              numeric: true,
            },
          ]}
          rows={pairs.map((p) => ({
            id: `${p.a.id}|${p.b.id}`,
            cells: {
              pair: pairText(p),
              patients: { g: p.patients, kind: "count" },
              share: { g: p.share_of_a, kind: "share", beside: p.patients },
            },
          }))}
        />
      ),
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
