"use client";
import { ChartColumn, Table2 } from "lucide-react";
import { useId, useState } from "react";
import type { Guarded, SeriesOut } from "@/lib/api/analytics-contract";
import type { Person } from "@/lib/api/contract";
import {
  isHidden,
  measureLabel,
  MEASURE_KIND,
  valueText,
} from "@/lib/analytics/measures";
import { Button } from "@mhai/ui/button";
import { dayMonthLabel } from "@/lib/format";

const shown = (n: number): Guarded => ({ value: n, suppressed: false });

/**
 * One measure for one hospital over the period, as columns, with the
 * median of the other hospitals as a dashed mark on each column: rates
 * and medians only, never totals across hospitals of different sizes.
 * A hidden value reads "Fewer than 5" and draws no column. Below it, the
 * hospital's size for context.
 */
export function ComparePanel({
  hospital,
  series,
  size,
}: {
  /** Null for a change across all hospitals (no median to compare with). */
  hospital: Person | null;
  series: SeriesOut;
  /** "214 staff · 1,180 questions this period"; null when not known. */
  size: string | null;
}) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const kind = MEASURE_KIND[series.measure];
  const name = hospital?.name ?? "All hospitals";
  const title = `${measureLabel(series.measure)}: ${name}`;
  const points = series.points.map((p, i) => {
    const hidden = isHidden(p.value, kind);
    return {
      key: `${p.start}-${i}`,
      label: dayMonthLabel(p.start),
      value: hidden ? null : p.value.value,
      text: valueText(p.value, kind),
      median: p.median,
      medianText: p.median === null ? null : valueText(shown(p.median), kind),
    };
  });
  const hasMedian = points.some((p) => p.median !== null);
  const top = Math.max(
    Number.EPSILON,
    ...points.map((p) => p.value ?? 0),
    ...points.map((p) => p.median ?? 0),
  );
  const pct = (v: number) => `${Math.round((v * 100) / top)}%`;
  const describe = (p: (typeof points)[number]) =>
    `${p.label}: ${p.text}${p.medianText ? `; median of the other hospitals ${p.medianText}` : ""}`;
  const summary = hasMedian
    ? `${name} by period, with the median of the other hospitals marked.`
    : `${name} by period.`;

  return (
    <section aria-labelledby={titleId} className="card-v3 px-[22px] py-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="flex-1 text-[14px] font-semibold">
          {title}
        </h3>
        {points.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="max-sm:w-full"
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? (
              <ChartColumn aria-hidden className="size-4" />
            ) : (
              <Table2 aria-hidden className="size-4" />
            )}
            {asTable ? "Show as chart" : "Show as table"}
          </Button>
        )}
      </div>
      <p id={summaryId} className="mb-3 text-[13px] text-ink-2">
        {summary}
      </p>
      {points.length === 0 ? (
        <p className="text-[13px] text-ink-3">No data yet</p>
      ) : asTable ? (
        <table className="w-full text-[13px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="py-1 text-left font-semibold">
                Period starting
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                {name}
              </th>
              {hasMedian && (
                <th scope="col" className="py-1 pl-3 text-right font-semibold">
                  Median of the others
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  {p.label}
                </th>
                <td className="py-1 text-right font-mono">{p.text}</td>
                {hasMedian && (
                  <td className="py-1 pl-3 text-right font-mono">
                    {p.medianText ?? "No data yet"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="max-sm:overflow-x-auto">
            <ol
              aria-labelledby={titleId}
              aria-describedby={summaryId}
              className="flex h-28 items-end gap-[2px] border-b border-line max-sm:w-max max-sm:min-w-full sm:h-40"
            >
              {points.map((p) => (
                <li
                  key={p.key}
                  aria-label={describe(p)}
                  className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end max-sm:min-w-6"
                >
                  <span
                    aria-hidden
                    className="block w-full rounded-t-sm bg-mint"
                    style={{
                      height: p.value ? `max(2px, ${pct(p.value)})` : 0,
                    }}
                  />
                  {p.median !== null && (
                    <span
                      aria-hidden
                      data-median
                      className="absolute inset-x-0 border-t-2 border-dashed border-ink"
                      style={{ bottom: pct(p.median) }}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div
            aria-hidden
            className="mt-1 flex justify-between gap-2 text-[11px] text-ink-3"
          >
            <span>{points[0]!.label}</span>
            {points.length > 1 && <span>{points.at(-1)!.label}</span>}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-3 rounded-sm bg-mint"
              />
              {name}
            </span>
            {hasMedian && (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block w-4 border-t-2 border-dashed border-ink"
                />
                Median of the other hospitals
              </span>
            )}
          </p>
        </>
      )}
      {size && <p className="mt-3 text-[13px] text-ink-2">{size}</p>}
    </section>
  );
}
