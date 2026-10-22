"use client";
import type {
  AnalysisFilters,
  PrevalenceOut,
} from "@/lib/api/analysis-contract";
import { countLabel } from "@/lib/admin/report";
import { frameState, useAnalysisView } from "@/lib/analysis-queries";
import { shows } from "@/lib/analysis/guards";
import { conditionName, conditionText, countText } from "@/lib/analysis/labels";
import { viewSummary } from "@/lib/analysis/summary";
import type { BarItem, Column } from "@mhai/ui/charts/types";
import { BarList } from "@mhai/ui/charts/bar-list";
import { ColumnChart } from "@mhai/ui/charts/column-chart";
import { DataTable } from "./data-table";
import { Panel, ViewFrame } from "./view-frame";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Week of 6 Oct" or "Oct 2026". */
export function bucketLabel(start: string, bucket: "week" | "month"): string {
  const d = new Date(`${start}T00:00:00Z`);
  return bucket === "week" ? `Week of ${DAY.format(d)}` : MONTH.format(d);
}

const casesText = (n: number) =>
  n === 1 ? "1 case" : `${countLabel(n)} cases`;

/** A hidden point draws no column and is left out of the scale. */
export function seriesColumns(d: PrevalenceOut): Column[] {
  return d.series.map((p) => ({
    key: p.start,
    label: bucketLabel(p.start, d.bucket),
    value: p.cases.value ?? 0,
    hidden: !shows(p.cases),
  }));
}

function conditionBars(d: PrevalenceOut): BarItem[] {
  return d.by_condition.map((r) => ({
    key: r.condition.id,
    label: conditionText(r.condition),
    value: r.cases.value,
    text: countText(r.cases),
    hidden: !shows(r.cases),
    note: shows(r.new) ? `${countText(r.new)} new in this period` : undefined,
  }));
}

export function PrevalenceBody({ d }: { d: PrevalenceOut }) {
  const unit = d.bucket === "week" ? "week" : "month";
  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <ColumnChart
          title="Cases over time"
          columns={seriesColumns(d)}
          summary={`Cases each ${unit}. A ${unit} with fewer than 5 draws no column.`}
          valueText={casesText}
          headers={[unit === "week" ? "Week" : "Month", "Cases"]}
          markLegend=""
          tableToggle={false}
        />
      </div>
      <Panel title="By condition">
        <BarList label="Cases by condition" items={conditionBars(d)} />
      </Panel>
    </div>
  );
}

export function PrevalenceTables({ d }: { d: PrevalenceOut }) {
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        caption="Cases by condition"
        columns={[
          { key: "condition", label: "Condition" },
          { key: "icd10", label: "ICD-10" },
          { key: "cases", label: "Cases", numeric: true },
          { key: "new", label: "New in this period", numeric: true },
          { key: "existing", label: "Existing", numeric: true },
        ]}
        rows={d.by_condition.map((r) => ({
          key: r.condition.id,
          cells: {
            condition: conditionName(r.condition),
            icd10: r.condition.icd10 ?? "—",
            cases: r.cases,
            new: r.new,
            existing: r.existing,
          },
        }))}
      />
      <DataTable
        caption="Cases over time"
        columns={[
          { key: "start", label: d.bucket === "week" ? "Week" : "Month" },
          { key: "cases", label: "Cases", numeric: true },
          {
            key: "new",
            label: d.bucket === "week" ? "New that week" : "New that month",
            numeric: true,
          },
        ]}
        rows={d.series.map((p) => ({
          key: p.start,
          cells: {
            start: bucketLabel(p.start, d.bucket),
            cases: p.cases,
            new: p.new,
          },
        }))}
      />
    </div>
  );
}

/** Prevalence and trends: cases over time and by condition. */
export function PrevalenceView({ filters }: { filters: AnalysisFilters }) {
  const q = useAnalysisView("prevalence", filters);
  const state = frameState(q);
  const d = state.status === "ok" ? state.data : null;
  const none = d !== null && d.patients.value === 0 && !d.patients.suppressed;
  return (
    <ViewFrame
      view="prevalence"
      state={state}
      updatedAt={d?.updated_at ?? null}
      onRetry={() => void q.refetch()}
      summary={d ? viewSummary("prevalence", d) : null}
      chart={d && !none ? <PrevalenceBody d={d} /> : null}
      table={d && !none ? <PrevalenceTables d={d} /> : null}
    />
  );
}
