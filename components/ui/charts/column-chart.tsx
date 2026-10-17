"use client";
import { ChartColumn, Table2 } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Column } from "@/lib/charts";
import { Button } from "../button";
import { cn } from "../cn";

const HEADING = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * Columns over time with a text summary, a table view, one tab stop with
 * arrow-key movement, and a phone layout. Knows nothing about what it
 * counts, so Analysis reuses it.
 */
export function ColumnChart({
  title,
  columns,
  summary,
  valueText,
  headers,
  markLegend,
  level = 3,
}: {
  title: string;
  columns: readonly Column[];
  summary: string;
  valueText: (n: number) => string;
  headers: readonly [string, string];
  /** What a marked column means, written beside the marker in the legend. */
  markLegend: string;
  level?: 2 | 3 | 4;
}) {
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const titleId = useId();
  const summaryId = useId();
  const H = HEADING[level];
  const top = Math.max(1, ...columns.map((c) => c.value));
  const marked = columns.some((c) => c.mark);
  const describe = (c: Column) =>
    `${c.label}: ${valueText(c.value)}${c.mark ? `, ${c.mark}` : ""}`;
  const last = columns.length - 1;
  // The data can shrink under a live chart (period change, kept-alive route).
  const current = Math.min(active, Math.max(0, last));
  // Keyed, so a data swap that drops the focused column drops its caption.
  const shown = columns.find((c) => c.key === focused) ?? null;
  // A hidden route fires no blur; don't come back to a stale caption.
  useLayoutEffect(() => () => setFocused(null), []);

  function move(e: KeyboardEvent, i: number) {
    const to =
      e.key === "ArrowRight"
        ? Math.min(last, i + 1)
        : e.key === "ArrowLeft"
          ? Math.max(0, i - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    setActive(to);
    refs.current[to]?.focus();
  }

  return (
    <section aria-labelledby={titleId} className="card-v3 px-[22px] py-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <H id={titleId} className="flex-1 text-[14px] font-semibold">
          {title}
        </H>
        {columns.length > 0 && (
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
      {columns.length === 0 ? null : asTable ? (
        <table className="w-full text-[13px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="py-1 text-left font-semibold">
                {headers[0]}
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                {headers[1]}
              </th>
              {marked && (
                <th scope="col" className="py-1 pl-3 text-left font-semibold">
                  Note
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  {c.label}
                </th>
                <td className="py-1 text-right font-mono">
                  {c.value.toLocaleString("en-GB")}
                </td>
                {marked && (
                  <td className="py-1 pl-3 [overflow-wrap:anywhere]">
                    {c.mark ?? ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          {/* On phones each column is at least a 44 px target and the chart
              scrolls sideways; focusing a column scrolls it into view. */}
          <div className="max-sm:overflow-x-auto">
            <ol
              aria-labelledby={titleId}
              aria-describedby={summaryId}
              className="flex h-28 items-end gap-[2px] border-b border-line max-sm:w-max max-sm:min-w-full sm:h-40"
            >
              {columns.map((c, i) => (
                <li
                  key={c.key}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  tabIndex={i === current ? 0 : -1}
                  aria-label={describe(c)}
                  onKeyDown={(e) => move(e, i)}
                  onFocus={() => {
                    setActive(i);
                    setFocused(c.key);
                  }}
                  onBlur={() => setFocused(null)}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-sm focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-mint-deep max-sm:min-w-11"
                >
                  {c.mark && (
                    <span
                      aria-hidden
                      className="mb-0.5 text-[10px] leading-none text-warn-deep"
                    >
                      ▲
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      "block w-full origin-bottom rounded-t-sm motion-safe:animate-[rise_var(--t-story)_var(--e-out)_both]",
                      c.mark ? "bg-warn" : "bg-mint",
                    )}
                    style={{
                      height: c.value
                        ? `${Math.max(2, Math.round((c.value * 100) / top))}%`
                        : 0,
                    }}
                  />
                </li>
              ))}
            </ol>
          </div>
          <div
            aria-hidden
            className="mt-1 flex justify-between gap-2 text-[11px] text-ink-3"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {columns[0]!.label}
            </span>
            {columns.length > 2 && (
              <span className="hidden sm:inline min-w-0 [overflow-wrap:anywhere]">
                {columns[Math.floor(last / 2)]!.label}
              </span>
            )}
            {last > 0 && (
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {columns[last]!.label}
              </span>
            )}
          </div>
          <p aria-hidden className="mt-1 min-h-5 text-[12.5px] text-ink-2">
            {shown ? describe(shown) : ""}
          </p>
          {marked && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-2">
              <span aria-hidden className="text-warn-deep">
                ▲
              </span>
              {markLegend}
            </p>
          )}
        </>
      )}
    </section>
  );
}
