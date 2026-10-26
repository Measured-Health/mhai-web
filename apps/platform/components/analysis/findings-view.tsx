"use client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Info,
  Minus,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FindingsData } from "@/lib/api/analysis-contract";
import { SEVERITIES, SEVERITY_LABEL, valueText } from "@/lib/analysis/labels";
import {
  ALERTS_TITLE,
  HOSPITAL_HEADLINE,
  alertsTotalText,
  countValue,
  findingKey,
  findingText,
  sortFindings,
  viewTables,
} from "@/lib/analysis/tables";
import type { ViewRead } from "@/lib/analysis/read";
import { BarList } from "@mhai/ui/charts/bar-list";
import type { BarItem } from "@mhai/ui/charts/types";
import { ComparisonPanel } from "./comparison-panel";
import { SpecTables } from "./data-table";
import { HospitalRows } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { Block, GroupLine } from "./view-parts";

export const USAGE_LINK = "See alert handling on Usage";

type Finding = FindingsData["findings"][number];
type Severity = (typeof SEVERITIES)[number];

/** Each flag's icon; its words are `flagText`, shared with the CSV. */
const FLAG_ICON: Record<"high" | "low" | "abnormal" | "none", LucideIcon> = {
  high: ArrowUp,
  low: ArrowDown,
  abnormal: TriangleAlert,
  none: Minus,
};
const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  critical: OctagonAlert,
  urgent: TriangleAlert,
  info: Info,
};

function findingBar(f: Finding): BarItem {
  const n = countValue(f.patients);
  const Icon = FLAG_ICON[f.flag ?? "none"];
  return {
    key: findingKey(f),
    label: findingText(f),
    icon: <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />,
    value: n,
    text: valueText(f.patients, "count"),
    hidden: n === null && f.patients.why === undefined,
    note: n === null ? undefined : valueText(f.rate.per_1000, "rate"),
  };
}

/**
 * Findings and alerts (spec §4.6): flagged findings by patients, with the
 * flag in words and an icon, and the rate per 1,000 seen; alerts by
 * severity. How alerts are handled is on Usage: no acknowledgement times
 * here. The comparison is on abnormal findings per 1,000.
 */
export function FindingsView({
  state,
  onRetry,
  mode,
  onMode,
}: {
  state: ViewRead<"findings"> | undefined;
  onRetry(): void;
  mode: ChartOrTable;
  onMode(m: ChartOrTable): void;
}) {
  const ok = state?.status === "ok" ? state.data : null;
  let body: {
    summary: ReactNode;
    chart: ReactNode;
    table: ReactNode;
    comparison: ReactNode;
    hospitals: ReactNode;
  } | null = null;
  if (ok) {
    const d = ok.data;
    const findings = sortFindings(d.findings);
    const total = alertsTotalText(d);
    const usage = (
      <Link
        href="/usage"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-[13.5px] font-semibold text-mint-deep underline focus-visible:outline-2 focus-visible:outline-mint-deep"
      >
        {USAGE_LINK}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    );
    body = {
      summary: <GroupLine meta={ok} />,
      chart: (
        <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Block title="Findings">
            <BarList
              label="Findings"
              items={findings.map(findingBar)}
              empty="No flagged findings."
            />
          </Block>
          <Block title={ALERTS_TITLE}>
            <p className="text-[13px] text-ink-2">{total}</p>
            <BarList
              label={ALERTS_TITLE}
              items={SEVERITIES.map((k) => {
                const g = d.alerts.by_severity[k];
                const n = countValue(g);
                const Icon = SEVERITY_ICON[k];
                return {
                  key: k,
                  label: SEVERITY_LABEL[k],
                  icon: (
                    <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />
                  ),
                  value: n,
                  text: valueText(g, "count"),
                  hidden: n === null && g.why === undefined,
                };
              })}
            />
            {usage}
          </Block>
        </div>
      ),
      table: (
        <>
          <SpecTables tables={viewTables("findings", ok)} />
          <p className="text-[13px] text-ink-2">{total}</p>
          {usage}
        </>
      ),
      comparison:
        ok.scope === "hospital" && ok.comparison ? (
          <ComparisonPanel comparison={ok.comparison} kind="rate" />
        ) : null,
      hospitals:
        ok.scope === "all" && ok.hospitals ? (
          <HospitalRows
            rows={ok.hospitals}
            headlineLabel={HOSPITAL_HEADLINE.findings!.label}
          />
        ) : null,
    };
  }
  return (
    <ViewFrame
      view="findings"
      state={state}
      onRetry={onRetry}
      mode={mode}
      onMode={onMode}
      {...body}
    />
  );
}
