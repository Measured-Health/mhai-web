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
import type { AGuarded, FindingsData } from "@/lib/api/analysis-contract";
import {
  NOT_STANDARDISED,
  hiddenBeside,
  valueText,
} from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { BarList } from "@mhai/ui/charts/bar-list";
import type { BarItem } from "@mhai/ui/charts/types";
import { isSmallCount } from "@mhai/ui/small-groups";
import { ComparisonPanel } from "./comparison-panel";
import { DataTable } from "./data-table";
import { HospitalRows } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { Block, GroupLine, byShownThenName, shownValue } from "./view-parts";

export const USAGE_LINK = "See alert handling on Usage";
const HEADLINE_LABEL = "Abnormal findings per 1,000";

type Finding = FindingsData["findings"][number];
type Flag = Finding["flag"];
type Severity = keyof FindingsData["alerts"]["by_severity"];

const FLAG: Record<NonNullable<Flag> | "none", [string, LucideIcon]> = {
  high: ["High", ArrowUp],
  low: ["Low", ArrowDown],
  abnormal: ["Abnormal", TriangleAlert],
  none: ["No flag", Minus],
};
const flagOf = (f: Flag) => FLAG[f ?? "none"];
const SEVERITY: [Severity, string, LucideIcon][] = [
  ["critical", "Critical", OctagonAlert],
  ["urgent", "Urgent", TriangleAlert],
  ["info", "Info", Info],
];

const nameOf = (f: Finding) => f.name ?? NOT_STANDARDISED;
/** "Potassium · High": the flag in words, never by colour alone. */
const findingText = (f: Finding) => `${nameOf(f)} · ${flagOf(f.flag)[0]}`;
const keyOf = (f: Finding) => `${f.name ?? "-"}|${f.flag ?? "-"}`;
/** A count that reads as a number; null when it reads in words. */
const countOf = (g: AGuarded) => {
  const n = shownValue(g);
  return n === null || isSmallCount(n) ? null : n;
};
const rateText = (f: Finding) =>
  hiddenBeside(f.rate.per_1000, f.patients) ??
  valueText(f.rate.per_1000, "rate");

function findingBar(f: Finding): BarItem {
  const n = countOf(f.patients);
  const Icon = flagOf(f.flag)[1];
  return {
    key: keyOf(f),
    label: findingText(f),
    icon: <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />,
    value: n,
    text: valueText(f.patients, "count"),
    hidden: n === null && f.patients.why === undefined,
    note: n === null ? undefined : rateText(f),
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
    const findings = byShownThenName(
      d.findings,
      (f) => countOf(f.patients),
      findingText,
    );
    const total = valueText(d.alerts.total, "count");
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
          <Block title="Alerts by severity">
            <p className="text-[13px] text-ink-2">Alerts in all: {total}</p>
            <BarList
              label="Alerts by severity"
              items={SEVERITY.map(([k, label, Icon]) => {
                const g = d.alerts.by_severity[k];
                const n = countOf(g);
                return {
                  key: k,
                  label,
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
          <DataTable
            caption="Findings"
            columns={[
              { key: "finding", label: "Finding" },
              { key: "flag", label: "Flag" },
              { key: "patients", label: "Patients", numeric: true },
              { key: "rate", label: "Per 1,000 seen", numeric: true },
            ]}
            rows={findings.map((f) => ({
              id: keyOf(f),
              cells: {
                finding: nameOf(f),
                flag: flagOf(f.flag)[0],
                patients: { g: f.patients, kind: "count" },
                rate: { g: f.rate.per_1000, kind: "rate", beside: f.patients },
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
              ...SEVERITY.map(([k, label]) => ({
                id: k,
                cells: {
                  severity: label,
                  alerts: {
                    g: d.alerts.by_severity[k],
                    kind: "count" as const,
                  },
                },
              })),
            ]}
          />
          <p className="text-[13px] text-ink-2">Alerts in all: {total}</p>
          {usage}
        </>
      ),
      comparison:
        ok.scope === "hospital" && ok.comparison ? (
          <ComparisonPanel comparison={ok.comparison} kind="rate" />
        ) : null,
      hospitals:
        ok.scope === "all" && ok.hospitals ? (
          <HospitalRows rows={ok.hospitals} headlineLabel={HEADLINE_LABEL} />
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
