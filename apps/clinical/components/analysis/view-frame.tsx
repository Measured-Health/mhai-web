"use client";
import { ChartColumn, OctagonAlert, Table2, WifiOff } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { ViewId } from "@/lib/api/analysis-contract";
import type { FrameState } from "@/lib/analysis-queries";
import { VIEW_TITLE, failedText } from "@/lib/analysis/labels";
import { eventClock } from "@/lib/time";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { useNow } from "@mhai/ui/hooks/use-now";
import { Skeleton } from "@mhai/ui/skeleton";

/** "Updated 07:00", or "Updated 21 Oct 07:00" before today. */
export function UpdatedAt({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const now = useNow(60_000);
  const time = eventClock(iso, now);
  if (!time) return null;
  return (
    <p className={cn("text-[12px] text-ink-3", className)}>Updated {time}</p>
  );
}

/** A titled card inside a view: one chart or one table. */
export function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("card-v3 min-w-0 px-[22px] py-4", className)}
    >
      <h3 id={id} className="mb-3 text-[14px] font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
        pressed ? "bg-ink text-white" : "text-ink-2 hover:bg-bg",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One Analysis view: its title, a one-sentence summary, Chart and Table,
 * and when it was updated. A failed view says only "Couldn't load {view}"
 * with Try again: never a zero, never a stale chart. With no chart and no
 * table (no patients match), the summary stands alone.
 */
export function ViewFrame({
  view,
  state,
  updatedAt,
  onRetry,
  summary,
  chart,
  table,
}: {
  view: ViewId;
  state: FrameState<unknown>;
  updatedAt: string | null;
  onRetry: () => void;
  summary: ReactNode;
  chart: ReactNode;
  table: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const title = VIEW_TITLE[view];
  const hasBody = chart !== null || table !== null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="flex-1 text-[18px] font-semibold">
          {title}
        </h2>
        {state.status === "ok" && hasBody && (
          <div className="flex gap-1 rounded-full border border-line bg-white p-0.5">
            <Toggle pressed={!asTable} onClick={() => setAsTable(false)}>
              <ChartColumn aria-hidden className="size-4" />
              Chart
            </Toggle>
            <Toggle pressed={asTable} onClick={() => setAsTable(true)}>
              <Table2 aria-hidden className="size-4" />
              Table
            </Toggle>
          </div>
        )}
      </div>
      {state.status === "failed" ? (
        <div
          role="alert"
          className="card-v3 flex flex-wrap items-center gap-3 p-5 text-[14px]"
        >
          <OctagonAlert aria-hidden className="size-5 shrink-0 text-bad-deep" />
          <span className="flex-1">{failedText(view)}</span>
          <Button
            size="sm"
            variant="ghost"
            className="sm:min-h-11"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : state.status === "offline" ? (
        <p
          role="status"
          className="card-v3 flex items-center justify-center gap-2 p-6 text-center text-[14px] text-ink-2"
        >
          <WifiOff aria-hidden className="size-4 shrink-0" />
          You&apos;re offline. {title} will load when you reconnect.
        </p>
      ) : state.status === "loading" ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <p className="text-[14px] text-ink-2 [overflow-wrap:anywhere]">
            {summary}
          </p>
          {updatedAt && <UpdatedAt iso={updatedAt} />}
          {hasBody && (asTable ? table : chart)}
        </>
      )}
    </section>
  );
}
