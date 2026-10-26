"use client";
import { BarChart3, Table2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { ViewId } from "@/lib/api/analysis-contract";
import { NO_PATIENTS, VIEW_TITLE, failedText } from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { updatedLine } from "../analytics/updated-line";
import { Loading } from "../states/loading";

export type ChartOrTable = "chart" | "table";

/**
 * One view's frame: its title, Chart / Table, "Updated {time}", and its
 * own loading, empty and failed states. A failed view shows only
 * "Couldn't load {view}" and Try again: never zeros, never the others.
 */
export function ViewFrame<V extends ViewId>({
  view,
  state,
  onRetry,
  mode,
  onMode,
  summary,
  chart,
  table,
  comparison,
  hospitals,
}: {
  view: V;
  state: ViewRead<V> | undefined;
  onRetry(): void;
  mode: ChartOrTable;
  onMode(m: ChartOrTable): void;
  summary?: ReactNode;
  chart?: ReactNode;
  table?: ReactNode;
  comparison?: ReactNode;
  hospitals?: ReactNode;
}) {
  const id = useId();
  const failed = state?.status === "failed";
  const ok = state?.status === "ok" ? state : null;
  const empty =
    ok !== null && !ok.data.patients.suppressed && ok.data.patients.value === 0;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 md:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={id} className="text-[15px] font-semibold">
          {VIEW_TITLE[view]}
        </h2>
        {!failed && (
          <div
            role="group"
            aria-label="Show as"
            className="ml-auto flex gap-1 rounded-full bg-bg p-1"
          >
            {(
              [
                ["chart", "Chart", BarChart3],
                ["table", "Table", Table2],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
                  mode === m ? "bg-white text-ink shadow-sm" : "text-ink-3",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {state === undefined && <Loading label={`Loading ${VIEW_TITLE[view]}`} />}
      {failed && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-[14px] font-semibold text-bad-deep">
            {failedText(view)}
          </p>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {ok && (
        <>
          <p className="text-[12.5px] text-ink-3">
            {updatedLine(ok.data.updated_at)}
          </p>
          {empty ? (
            <p className="text-[14px] text-ink-2">{NO_PATIENTS}</p>
          ) : (
            <>
              {summary}
              {mode === "chart" ? chart : table}
              {comparison}
              {hospitals}
            </>
          )}
        </>
      )}
    </section>
  );
}
