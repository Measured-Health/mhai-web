"use client";
import type { ReactNode } from "react";
import type {
  AnalysisFilters,
  CoOccurringOut,
} from "@/lib/api/analysis-contract";
import { frameState, useAnalysisView } from "@/lib/analysis-queries";
import { shows } from "@/lib/analysis/guards";
import {
  conditionName,
  conditionText,
  countText,
  shareText,
} from "@/lib/analysis/labels";
import { noteOf } from "@/lib/analysis/note";
import { viewSummary } from "@/lib/analysis/summary";
import type { BarItem } from "@mhai/ui/charts/types";
import { BarList } from "@mhai/ui/charts/bar-list";
import { DataTable } from "./data-table";
import { Panel, ViewFrame } from "./view-frame";

type Pair = CoOccurringOut["pairs"][number];

/** "Type 2 diabetes + Hypertension". */
export const pairLabel = (p: Pair) =>
  `${conditionName(p.a)} + ${conditionName(p.b)}`;

/**
 * One bar per pair. `action` (e.g. See patients) renders in the bar's note,
 * which BarList leaves out for a hidden count.
 */
export function pairBars(
  d: CoOccurringOut,
  action?: (row: Pair) => ReactNode,
): BarItem[] {
  return d.pairs.map((p) => ({
    key: `${p.a.id}/${p.b.id}`,
    label: pairLabel(p),
    value: p.patients.value,
    text: countText(p.patients),
    hidden: !shows(p.patients),
    note: noteOf(
      shows(p.share_of_a)
        ? `${shareText(p.share_of_a)} of people with ${conditionName(p.a)}`
        : null,
      action?.(p),
    ),
  }));
}

function CoOccurringTable({ d }: { d: CoOccurringOut }) {
  return (
    <DataTable
      caption="Conditions found together"
      columns={[
        { key: "a", label: "Condition A" },
        { key: "b", label: "Condition B" },
        { key: "patients", label: "Patients", numeric: true },
        { key: "share", label: "Share of condition A", numeric: true },
      ]}
      rows={d.pairs.map((p) => ({
        key: `${p.a.id}/${p.b.id}`,
        cells: {
          a: conditionText(p.a),
          b: conditionText(p.b),
          patients: p.patients,
          share: shareText(p.share_of_a),
        },
      }))}
    />
  );
}

/** Co-occurring conditions: the pairs found together, with the share of the first. */
export function CoOccurringView({ filters }: { filters: AnalysisFilters }) {
  const q = useAnalysisView("co-occurring", filters);
  const state = frameState(q);
  const d = state.status === "ok" ? state.data : null;
  const none = d !== null && d.patients.value === 0 && !d.patients.suppressed;
  return (
    <ViewFrame
      view="co-occurring"
      state={state}
      updatedAt={d?.updated_at ?? null}
      onRetry={() => void q.refetch()}
      summary={d ? viewSummary("co-occurring", d) : null}
      chart={
        d && !none ? (
          <Panel title="Conditions found together">
            <BarList label="Patients by pair" items={pairBars(d)} />
          </Panel>
        ) : null
      }
      table={d && !none ? <CoOccurringTable d={d} /> : null}
    />
  );
}
