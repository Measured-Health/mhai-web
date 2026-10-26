"use client";
import type { ReactNode } from "react";
import type { AGuarded, ConditionRef, Rate } from "@/lib/api/analysis-contract";
import {
  NOT_ENOUGH_PEERS,
  NOT_SHOWN,
  NOT_STANDARDISED,
  NO_DATA,
  TOO_FEW_HOSPITALS,
  conditionText,
  countShows,
  hiddenBeside,
  monthLabel,
  monthsText,
  valueText,
} from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { BarList } from "@mhai/ui/charts/bar-list";
import { ColumnChart } from "@mhai/ui/charts/column-chart";
import type { BarItem, Column } from "@mhai/ui/charts/types";
import { FEWER_THAN_5, isSmallCount } from "@mhai/ui/small-groups";
import { ComparisonPanel } from "./comparison-panel";
import { DataTable, type DataColumn, type DataRow } from "./data-table";
import { HospitalRows, rateWithCount } from "./hospital-rows";
import { ViewFrame, type ChartOrTable } from "./view-frame";

const RATE_LABEL = "Cases per 1,000";
const MONTHS_TITLE = "Cases per 1,000 by month";
const MEDIAN_LABEL = "Median of similar hospitals";

/** A number that shows; null when hidden or empty. Never worked out from others. */
const shown = (g: AGuarded) =>
  g.suppressed || g.value === null ? null : g.value;
const rateText = (n: number) =>
  valueText({ value: n, suppressed: false }, "rate");

type Series = { month: string; rate: Rate; median: AGuarded | null }[];
type ByCondition = {
  condition: ConditionRef;
  cases: AGuarded;
  rate: Rate;
  new: AGuarded;
}[];

/** One month's column: hidden ones draw nothing and read in words. */
function columnOf(s: Series[number], withMedian: boolean): Column {
  const g = s.rate.per_1000;
  const second = withMedian && s.median ? shown(s.median) : null;
  // A hidden median: too few similar hospitals showed that month.
  const secondText =
    withMedian && s.median?.suppressed ? NOT_ENOUGH_PEERS : undefined;
  const base = {
    key: s.month,
    label: monthLabel(s.month),
    second,
    secondText,
  };
  if (g.suppressed && g.why === "too_few_hospitals")
    return { ...base, value: 0, text: TOO_FEW_HOSPITALS };
  const notShown = hiddenBeside(g, s.rate.count);
  if (notShown) return { ...base, value: 0, text: notShown };
  if (g.suppressed) return { ...base, value: 0, hidden: true };
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
  const few = series.filter(
    (s) =>
      s.rate.per_1000.suppressed &&
      s.rate.per_1000.why === undefined &&
      !countShows(s.rate.count),
  ).length;
  const notShown = series.filter(
    (s) => hiddenBeside(s.rate.per_1000, s.rate.count) !== null,
  ).length;
  const tooFew = series.filter(
    (s) => s.rate.per_1000.why === "too_few_hospitals",
  ).length;
  if (few)
    parts.push(
      `${few} ${few === 1 ? "month reads" : "months read"} ${FEWER_THAN_5}.`,
    );
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
  return `${RATE_LABEL} patients seen, ${monthsText(period)}: ${r}${detail}.`;
}

/**
 * Conditions by rate, largest first; anything not shown comes after, by
 * name, so a hidden row's place says nothing about its size.
 */
function sortConditions(rows: ByCondition): ByCondition {
  return [...rows].sort((a, b) => {
    const x = shown(a.rate.per_1000);
    const y = shown(b.rate.per_1000);
    if (x !== null && y !== null && x !== y) return y - x;
    if ((x === null) !== (y === null)) return x === null ? 1 : -1;
    return conditionText(a.condition).localeCompare(conditionText(b.condition));
  });
}

function barOf(c: ByCondition[number]): BarItem {
  const text = rateWithCount(c.rate);
  const note =
    c.new.why === "too_few_hospitals"
      ? `New: ${TOO_FEW_HOSPITALS}`
      : `${valueText(c.new, "count")} new in this period`;
  // From the guards, not the words: the rate and its count both hidden.
  const r = c.rate.per_1000;
  const n = c.rate.count;
  const hidden =
    r.suppressed &&
    r.why === undefined &&
    ((n.suppressed && n.why === undefined) ||
      (n.value !== null && isSmallCount(n.value)));
  return {
    key: c.condition.id,
    label: conditionText(c.condition),
    value: shown(c.rate.per_1000),
    text,
    hidden,
    note,
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
    const withMedian = one && ok.comparison !== null && ok.comparison.available;
    const monthColumns: DataColumn[] = [
      { key: "month", label: "Month" },
      { key: "cases", label: "Cases", numeric: true },
      { key: "seen", label: "Patients seen", numeric: true },
      { key: "rate", label: RATE_LABEL, numeric: true },
      ...(withMedian
        ? [{ key: "median", label: MEDIAN_LABEL, numeric: true }]
        : []),
    ];
    const monthRows: DataRow[] = series.map((s) => ({
      id: s.month,
      cells: {
        month: monthLabel(s.month),
        cases: { g: s.rate.count, kind: "count" },
        seen: { g: s.rate.base, kind: "count" },
        rate: { g: s.rate.per_1000, kind: "rate", beside: s.rate.count },
        ...(withMedian && s.median
          ? {
              median: s.median.suppressed
                ? NOT_ENOUGH_PEERS
                : { g: s.median, kind: "rate" },
            }
          : {}),
      },
    }));
    const conditionRows: DataRow[] = conditions.map((c) => ({
      id: c.condition.id,
      cells: {
        condition: c.condition.name ?? NOT_STANDARDISED,
        icd10: c.condition.icd10 ?? "No code",
        cases: { g: c.cases, kind: "count" },
        rate: { g: c.rate.per_1000, kind: "rate", beside: c.rate.count },
        new: { g: c.new, kind: "count" },
      },
    }));
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
            columns={series.map((s) => columnOf(s, withMedian))}
            summary={monthsSentence(series)}
            valueText={rateText}
            headers={["Month", RATE_LABEL]}
            markLegend=""
            tableToggle={false}
            secondLabel={withMedian ? MEDIAN_LABEL : undefined}
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
      table: (
        <>
          <DataTable
            caption={MONTHS_TITLE}
            columns={monthColumns}
            rows={monthRows}
          />
          <DataTable
            caption="By condition"
            columns={[
              { key: "condition", label: "Condition" },
              { key: "icd10", label: "ICD-10" },
              { key: "cases", label: "Cases", numeric: true },
              { key: "rate", label: RATE_LABEL, numeric: true },
              { key: "new", label: "New", numeric: true },
            ]}
            rows={conditionRows}
          />
        </>
      ),
      comparison:
        one && ok.comparison ? (
          <ComparisonPanel comparison={ok.comparison} kind="rate" />
        ) : null,
      hospitals:
        !one && ok.hospitals ? (
          <HospitalRows rows={ok.hospitals} headlineLabel={RATE_LABEL} />
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
