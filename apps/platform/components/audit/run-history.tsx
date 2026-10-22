"use client";
import {
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import { formatWhen } from "@/lib/activity-labels";
import {
  SHOWN_WORDS,
  integrityOf,
  rangeWords,
  type Shown,
} from "@/lib/audit/integrity";
import type { ReadRun } from "@/lib/audit/read";
import { useVerifyRuns } from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { useNow } from "@mhai/ui/hooks/use-now";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

/** Each state's icon and tone: always beside its words. */
export const SHOWN_LOOK: Record<
  Shown,
  { Icon: LucideIcon; className: string }
> = {
  intact: { Icon: ShieldCheck, className: "text-ok-deep" },
  broken: { Icon: ShieldAlert, className: "text-bad-deep" },
  couldnt_check: { Icon: TriangleAlert, className: "text-warn-deep" },
  checking: {
    Icon: LoaderCircle,
    className: "text-ink-2 [&>svg]:motion-safe:animate-spin",
  },
};

/**
 * A history row's state. Its age is judged from its own finish (`ageFrom`),
 * so an old Intact stays Intact here; `now` stays the real clock, so a
 * finish in the future never reads Intact.
 */
export const rowState = (run: ReadRun, now: number): Shown =>
  integrityOf(
    run,
    now,
    run.finished_at !== null ? Date.parse(run.finished_at) : now,
  );

export function StateWords({ shown }: { shown: Shown }) {
  const { Icon, className } = SHOWN_LOOK[shown];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold",
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {SHOWN_WORDS[shown]}
    </span>
  );
}

function Row({ run, now }: { run: ReadRun; now: number }) {
  const at = run.started_at;
  return (
    <li className="flex flex-col gap-0.5 border-b border-line py-3 text-[13.5px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2">
        <StateWords shown={rowState(run, now)} />
        <span aria-hidden className="text-ink-3">
          ·
        </span>
        {at ? (
          <time dateTime={at}>{formatWhen(at)}</time>
        ) : (
          <span>Time not recorded</span>
        )}
      </div>
      <p className="text-ink-2">{run.by ? run.by.name : "Daily schedule"}</p>
      <p className="text-ink-3">{rangeWords(run)}</p>
      {run.outcome && <p className="text-ink-2">Outcome recorded</p>}
    </li>
  );
}

/**
 * Past checks, newest first (spec §8.1): when, who or the daily schedule,
 * the state and the range. A Broken check keeps its row whatever follows.
 */
export function RunHistory() {
  const titleId = useId();
  const q = useVerifyRuns();
  const now = useNow();
  const net = useNeedsConnection("history-offline");
  const runs = q.data?.pages.flatMap((p) => p.runs) ?? [];

  return (
    <section aria-labelledby={titleId} className="card-v3 px-[22px] py-5">
      <h2 id={titleId} className="text-base font-semibold">
        History
      </h2>
      {q.isPending && <Loading label="Loading past checks" />}
      {q.isError && !q.data && (
        <div className="mt-3">
          <CouldntLoad what="past checks" onRetry={() => void q.refetch()} />
        </div>
      )}
      {q.data && runs.length === 0 && (
        <p className="mt-3 text-[13.5px] text-ink-3">No checks yet.</p>
      )}
      {runs.length > 0 && (
        <ol aria-labelledby={titleId} className="mt-2">
          {runs.map((r, i) => (
            <Row key={r.id ?? `row-${i}`} run={r} now={now} />
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 min-h-11"
            {...net.props}
            disabled={net.offline || q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            Load more
          </Button>
          <OfflineNote id="history-offline" />
        </>
      )}
    </section>
  );
}
