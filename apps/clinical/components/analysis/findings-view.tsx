"use client";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Info,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AlertSeverity } from "@/lib/api/alerts-contract";
import type { AnalysisFilters, FindingsOut } from "@/lib/api/analysis-contract";
import { frameState, useAnalysisView } from "@/lib/analysis-queries";
import { shows } from "@/lib/analysis/guards";
import {
  NOT_STANDARDISED,
  countText,
  minutesText,
} from "@/lib/analysis/labels";
import { noteOf } from "@/lib/analysis/note";
import { viewSummary } from "@/lib/analysis/summary";
import {
  SEVERITY,
  dismissReasonLabel,
  flagWord,
} from "@/lib/notifications/alert-view";
import type { BarItem } from "@mhai/ui/charts/types";
import { BarList } from "@mhai/ui/charts/bar-list";
import { DataTable } from "./data-table";
import { Panel, ViewFrame } from "./view-frame";

const SEVERITIES: readonly AlertSeverity[] = ["critical", "urgent", "info"];
const SEVERITY_ICON: Record<AlertSeverity, ReactNode> = {
  critical: (
    <OctagonAlert aria-hidden className="size-4 shrink-0 text-bad-deep" />
  ),
  urgent: (
    <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn-deep" />
  ),
  info: <Info aria-hidden className="size-4 shrink-0 text-ink-3" />,
};
const FLAG_ICON: Record<string, ReactNode> = {
  high: <ArrowUp aria-hidden className="size-4 shrink-0" />,
  low: <ArrowDown aria-hidden className="size-4 shrink-0" />,
  abnormal: <CircleAlert aria-hidden className="size-4 shrink-0" />,
};

/** "High", "Low" or "Abnormal"; empty when the finding has no flag. */
function flagText(flag: string | null): string | null {
  const w = flagWord(flag);
  return w ? w[0].toUpperCase() + w.slice(1) : null;
}

const findingName = (f: Finding) => f.name ?? NOT_STANDARDISED;
const findingKey = (f: Finding, i: number) =>
  `${f.name ?? ""}/${f.flag ?? ""}/${i}`;

type Finding = FindingsOut["findings"][number];

/**
 * One bar per finding, the flag in words and an icon. `action` (e.g. See
 * patients) renders in the bar's note, which BarList leaves out for a hidden count.
 */
export function findingBars(
  d: FindingsOut,
  action?: (row: Finding) => ReactNode,
): BarItem[] {
  return d.findings.map((f, i) => {
    const flag = flagText(f.flag);
    return {
      key: findingKey(f, i),
      label: flag ? `${findingName(f)} · ${flag}` : findingName(f),
      icon: f.flag ? FLAG_ICON[flagWord(f.flag)!] : undefined,
      value: f.patients.value,
      text: countText(f.patients),
      hidden: !shows(f.patients),
      note: noteOf(
        shows(f.results) ? `${countText(f.results)} results` : null,
        action?.(f),
      ),
    };
  });
}

function severityBars(d: FindingsOut): BarItem[] {
  return SEVERITIES.map((s) => {
    const g = d.alerts.by_severity[s];
    return {
      key: s,
      label: SEVERITY[s].label,
      icon: SEVERITY_ICON[s],
      value: g.value,
      text: countText(g),
      hidden: !shows(g),
    };
  });
}

function reasonBars(d: FindingsOut): BarItem[] {
  return d.alerts.dismiss_reasons.map((r) => ({
    key: r.reason,
    label: dismissReasonLabel(r.reason) ?? r.reason,
    value: r.count.value,
    text: countText(r.count),
    hidden: !shows(r.count),
  }));
}

function FindingsCharts({ d }: { d: FindingsOut }) {
  const a = d.alerts;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Findings">
        <BarList label="Patients by finding" items={findingBars(d)} />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Alerts by severity">
          <BarList label="Alerts by severity" items={severityBars(d)} />
        </Panel>
        <Panel title="Time to acknowledge">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[13px]">
            <dt>Median, all alerts</dt>
            <dd className="font-mono font-semibold">
              {minutesText(a.median_ack_minutes)}
            </dd>
            <dt>Median, Critical alerts</dt>
            <dd className="font-mono font-semibold">
              {minutesText(a.critical_median_ack_minutes)}
            </dd>
          </dl>
        </Panel>
      </div>
      <Panel title="Why alerts were dismissed">
        <BarList
          label="Dismissed alerts by reason"
          items={reasonBars(d)}
          empty="No alerts were dismissed."
        />
      </Panel>
    </div>
  );
}

function FindingsTables({ d }: { d: FindingsOut }) {
  const a = d.alerts;
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        caption="Findings"
        columns={[
          { key: "finding", label: "Finding" },
          { key: "flag", label: "Flag" },
          { key: "patients", label: "Patients", numeric: true },
          { key: "results", label: "Results", numeric: true },
        ]}
        rows={d.findings.map((f, i) => ({
          key: findingKey(f, i),
          cells: {
            finding: findingName(f),
            flag: f.flag ? (
              <span className="inline-flex items-center gap-1.5">
                {FLAG_ICON[flagWord(f.flag)!]}
                {flagText(f.flag)}
              </span>
            ) : (
              "—"
            ),
            patients: f.patients,
            results: f.results,
          },
        }))}
      />
      <DataTable
        caption="Alerts by severity"
        columns={[
          { key: "severity", label: "Severity" },
          { key: "alerts", label: "Alerts", numeric: true },
        ]}
        rows={[
          ...SEVERITIES.map((s) => ({
            key: s,
            cells: { severity: SEVERITY[s].label, alerts: a.by_severity[s] },
          })),
          { key: "all", cells: { severity: "All alerts", alerts: a.total } },
        ]}
      />
      <DataTable
        caption="Time to acknowledge"
        columns={[
          { key: "alerts", label: "Alerts" },
          { key: "median", label: "Median time", numeric: true },
        ]}
        rows={[
          {
            key: "all",
            cells: {
              alerts: "All alerts",
              median: minutesText(a.median_ack_minutes),
            },
          },
          {
            key: "critical",
            cells: {
              alerts: "Critical",
              median: minutesText(a.critical_median_ack_minutes),
            },
          },
        ]}
      />
      <DataTable
        caption="Why alerts were dismissed"
        columns={[
          { key: "reason", label: "Reason" },
          { key: "alerts", label: "Alerts", numeric: true },
        ]}
        rows={[
          ...a.dismiss_reasons.map((r) => ({
            key: r.reason,
            cells: {
              reason: dismissReasonLabel(r.reason) ?? r.reason,
              alerts: r.count,
            },
          })),
          {
            key: "all",
            cells: { reason: "All dismissed", alerts: a.dismissed },
          },
        ]}
      />
    </div>
  );
}

/** Findings and alerts: what the results show, and how alerts were handled. */
export function FindingsView({ filters }: { filters: AnalysisFilters }) {
  const q = useAnalysisView("findings", filters);
  const state = frameState(q);
  const d = state.status === "ok" ? state.data : null;
  const none = d !== null && d.patients.value === 0 && !d.patients.suppressed;
  return (
    <ViewFrame
      view="findings"
      state={state}
      updatedAt={d?.updated_at ?? null}
      onRetry={() => void q.refetch()}
      summary={d ? viewSummary("findings", d) : null}
      chart={d && !none ? <FindingsCharts d={d} /> : null}
      table={d && !none ? <FindingsTables d={d} /> : null}
    />
  );
}
