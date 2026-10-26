"use client";
import type { ReactNode } from "react";
import type {
  AGuarded,
  PrevalenceData,
  Rate,
} from "@/lib/api/analysis-contract";
import {
  NOT_ENOUGH_PEERS,
  NOT_SHOWN,
  NO_DATA,
  TOO_FEW_HOSPITALS,
  conditionText,
  monthLabel,
  monthsText,
  valueText,
} from "@/lib/analysis/labels";
import {
  MEDIAN_LABEL,
  MONTHS_TITLE,
  PREVALENCE_RATE,
  sortConditions,
  viewTables,
  withMedian,
} from "@/lib/analysis/tables";
import type { ViewRead } from "@/lib/analysis/read";
import { BarList } from "@mhai/ui/charts/bar-list";
import { ColumnChart } from "@mhai/ui/charts/column-chart";
import type { BarItem, Column } from "@mhai/ui/charts/types";
import { ComparisonPanel } from "./comparison-panel";
import { SpecTables } from "./data-table";
import { HospitalRows, rateWithCount } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";
import { isHiddenGroup } from "./view-parts";

/** A number that shows; null when hidden or empty. Never worked out from others. */
const shown = (g: AGuarded) =>
  g.suppressed || g.value === null ? null : g.value;
const rateText = (n: number) =>
  valueText({ value: n, suppressed: false }, "rate");

type Series = { month: string; rate: Rate; median: AGuarded | null }[];
type ByCondition = PrevalenceData["by_condition"];

/** One month's column: hidden ones draw nothing and read in words. */
function columnOf(s: Series[number], median: boolean): Column {
  const g = s.rate.per_1000;
  const second = median && s.median ? shown(s.median) : null;
  // A hidden median: too few similar hospitals showed that month.
  const secondText =
    median && s.median?.suppressed ? NOT_ENOUGH_PEERS : undefined;
  const base = {
    key: s.month,
    label: monthLabel(s.month),
    second,
    secondText,
  };
  if (g.suppressed && g.why === "too_few_hospitals")
    return { ...base, value: 0, text: TOO_FEW_HOSPITALS };
  // A hidden rate reads "Not shown" ("Fewer than 5" is for counts).
  if (g.suppressed) return { ...base, value: 0, text: NOT_SHOWN };
  if (g.value === null) return { ...base, value: 0, text: NO_DATA };
  return { ...base, value: g.value };
}

/** The months in a sentence, from shown values only. */
function monthsSentence(series: Series): string {
  const shownMonths = series
    .map((s) => ({ month: s.month, v: shown(s.rate.per_1000) }))
    .filter((s): s is { month: string; v: number } => s.v !== null);
  const parts: string[] = [];
  if (shownMonths.length === 0) parts.push("No month can be shown.");
  else {
    const hi = shownMonths.reduce((a, b) => (b.v > a.v ? b : a));
    const lo = shownMonths.reduce((a, b) => (b.v < a.v ? b : a));
    parts.push(
      `Highest in ${monthLabel(hi.month)} at ${rateText(hi.v)}; lowest in ${monthLabel(lo.month)} at ${rateText(lo.v)}.`,
    );
  }
  const notShown = series.filter(
    (s) => s.rate.per_1000.suppressed && s.rate.per_1000.why === undefined,
  ).length;
  const tooFew = series.filter(
    (s) => s.rate.per_1000.why === "too_few_hospitals",
  ).length;
  if (notShown)
    parts.push(
      `${notShown} ${notShown === 1 ? "month reads" : "months read"} ${NOT_SHOWN}.`,
    );
  if (tooFew)
    parts.push(
      `${tooFew} ${tooFew === 1 ? "month reads" : "months read"} ${TOO_FEW_HOSPITALS}.`,
    );
  return parts.join(" ");
}

/** The headline as a sentence, from shown values only. */
function headlineSentence(rate: Rate, period: { from: string; to: string }) {
  const count = shown(rate.count);
  const base = shown(rate.base);
  const r = valueText(rate.per_1000, "rate");
  const detail =
    shown(rate.per_1000) !== null && count !== null && base !== null
      ? ` (${valueText(rate.count, "count")} cases among ${valueText(rate.base, "count")} patients seen)`
      : "";
  return `${PREVALENCE_RATE} patients seen, ${monthsText(period)}: ${r}${detail}.`;
}

function barOf(c: ByCondition[number]): BarItem {
  const text = rateWithCount(c.rate);
  const note =
    c.new.why === "too_few_hospitals"
      ? `New: ${TOO_FEW_HOSPITALS}`
      : `${valueText(c.new, "count")} new in this period`;
  // From the guards, not the words: the rate and its count both hidden
  // reads "Not shown · Fewer than 5", with no bar and no note.
  const hidden = isHiddenGroup(c.rate.per_1000, c.rate.count);
  return {
    key: c.condition.id,
    label: conditionText(c.condition),
    value: shown(c.rate.per_1000),
    text,
    note: hidden ? undefined : note,
  };
}

/**
 * Prevalence and trends (spec §4.3): cases per 1,000 by month, conditions
 * by rate with their counts, a table of the same numbers, then the hospital
 * rows (All hospitals) or the fair comparison (One hospital).
 */
export function PrevalenceView({
  state,
  onRetry,
  mode,
  onMode,
}: {
  state: ViewRead<"prevalence"> | undefined;
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
    const one = ok.scope === "hospital";
    const series = ok.data.series;
    const conditions = sortConditions(ok.data.by_condition);
    const median = withMedian(ok);
    body = {
      summary: (
        <p className="text-[14px] text-ink-2">
          {headlineSentence(ok.headline, ok.period)}
        </p>
      ),
      chart: (
        <>
          <ColumnChart
            title={MONTHS_TITLE}
            columns={series.map((s) => columnOf(s, median))}
            summary={monthsSentence(series)}
            valueText={rateText}
            headers={["Month", PREVALENCE_RATE]}
            markLegend=""
            tableToggle={false}
            secondLabel={median ? MEDIAN_LABEL : undefined}
          />
          <div className="flex flex-col gap-2">
            <h3 className="text-[14px] font-semibold">By condition</h3>
            <BarList
              label="By condition"
              items={conditions.map(barOf)}
              empty="No conditions to show."
            />
          </div>
        </>
      ),
      table: <SpecTables tables={viewTables("prevalence", ok)} />,
      comparison:
        one && ok.comparison ? (
          <ComparisonPanel comparison={ok.comparison} kind="rate" />
        ) : null,
      hospitals:
        !one && ok.hospitals ? (
          <HospitalRows rows={ok.hospitals} headlineLabel={PREVALENCE_RATE} />
        ) : null,
    };
  }
  return (
    <ViewFrame
      view="prevalence"
      state={state}
      onRetry={onRetry}
      mode={mode}
      onMode={onMode}
      {...body}
    />
  );
}
