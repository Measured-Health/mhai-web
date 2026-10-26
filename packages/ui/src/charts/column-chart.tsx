"use client";
import { ChartColumn, Table2 } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Column } from "./types";
import { Button } from "../button";
import { cn } from "../cn";
import { FEWER_THAN_5 } from "../small-groups";

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
  tableToggle = true,
  secondLabel,
}: {
  title: string;
  columns: readonly Column[];
  summary: string;
  valueText: (n: number) => string;
  headers: readonly [string, string];
  /** What a marked column means, written beside the marker in the legend. */
  markLegend: string;
  level?: 2 | 3 | 4;
  /** False when the page gives its own table view (Analysis): no "Show as table" here. */
  tableToggle?: boolean;
  /** What a column's `second` mark is, e.g. "Median of similar hospitals". */
  secondLabel?: string;
}) {
  const [table, setAsTable] = useState(false);
  const asTable = tableToggle && table;
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const H = HEADING[level];
  const drawn = (c: Column) => !c.hidden && c.text === undefined;
  const hasSecond = (c: Column) =>
    typeof c.second === "number" && Number.isFinite(c.second);
  const top = Math.max(
    1,
    ...columns.map((c) => (drawn(c) ? c.value : 0)),
    ...columns.map((c) => (hasSecond(c) ? c.second! : 0)),
  );
  const marked = columns.some((c) => c.mark);
  const seconds = secondLabel !== undefined && columns.some(hasSecond);
  const written = (c: Column) =>
    c.hidden ? FEWER_THAN_5 : (c.text ?? valueText(c.value));
  const describe = (c: Column) =>
    `${c.label}: ${written(c)}${c.mark ? `, ${c.mark}` : ""}${
      !seconds
        ? ""
        : hasSecond(c)
          ? `, ${secondLabel}: ${valueText(c.second!)}`
          : c.secondText !== undefined
            ? `, ${secondLabel}: ${c.secondText}`
            : ""
    }`;
  const last = columns.length - 1;
  // The data can shrink under a live chart (period change, kept-alive route).
  const current = Math.min(active, Math.max(0, last));
  // Keyed, so a data swap that drops the focused column drops its caption.
  const shown = columns.find((c) => c.key === focused) ?? null;
  // On a phone a long series is wider than its card: say so, and make the
  // scroller reachable by keyboard.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [columns.length, asTable]);
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
    // Native focus() scrolls the column into view in the phone scroller.
    refs.current[to]?.focus();
  }

  return (
    <section aria-labelledby={titleId} className="card-v3 px-[22px] py-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <H id={titleId} className="flex-1 text-[14px] font-semibold">
          {title}
        </H>
        {columns.length > 0 && tableToggle && (
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
              {seconds && (
                <th scope="col" className="py-1 text-right font-semibold">
                  {secondLabel}
                </th>
              )}
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
                  {c.hidden
                    ? FEWER_THAN_5
                    : (c.text ?? c.value.toLocaleString("en-GB"))}
                </td>
                {seconds && (
                  <td className="py-1 text-right font-mono">
                    {hasSecond(c) ? c.second!.toLocaleString("en-GB") : ""}
                  </td>
                )}
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
              scrolls sideways, its axis labels with it; focusing a column
              scrolls it into view. */}
          <div
            ref={scroller}
            className="max-sm:overflow-x-auto"
            {...(scrolls
              ? {
                  role: "group",
                  tabIndex: 0,
                  "aria-label": `${title}, scrolls sideways`,
                }
              : {})}
          >
            <div className="max-sm:w-max max-sm:min-w-full">
              <ol
                aria-labelledby={titleId}
                aria-describedby={summaryId}
                className="flex h-28 items-end gap-[2px] border-b border-line sm:h-40"
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
                    className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-sm focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-mint-deep max-sm:min-w-11"
                  >
                    {seconds && hasSecond(c) && (
                      <span
                        aria-hidden
                        data-second
                        className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-ink-2"
                        style={{
                          bottom: `${Math.round((c.second! * 100) / top)}%`,
                        }}
                      />
                    )}
                    {c.mark && drawn(c) && (
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
                        height:
                          c.value && drawn(c)
                            ? `${Math.max(2, Math.round((c.value * 100) / top))}%`
                            : 0,
                      }}
                    />
                  </li>
                ))}
              </ol>
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
            </div>
          </div>
          {scrolls && (
            <p className="mt-1 text-[12px] text-ink-3 sm:hidden">
              Scroll sideways to see every column.
            </p>
          )}
          <p aria-hidden className="mt-1 min-h-5 text-[12.5px] text-ink-2">
            {shown ? describe(shown) : ""}
          </p>
          {seconds && (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-2">
              <span
                aria-hidden
                className="inline-block w-4 border-t-2 border-dashed border-ink-2"
              />
              {secondLabel}
            </p>
          )}
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
