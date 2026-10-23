"use client";
import {
  Ban,
  CheckCircle2,
  CircleAlert,
  Flag,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { AuditEvent, Outcome } from "@/lib/api/audit-contract";
import { formatWhen } from "@/lib/activity-labels";
import type { AuditRow, Undisplayable } from "@/lib/audit/read";
import {
  countWords,
  eventLine,
  gapLine,
  hospitalWords,
  outcomeWords,
  whoLine,
} from "@/lib/audit/words";
import {
  useReportUndisplayable,
  type useAuditEvents,
} from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

const HEADERS = ["Time", "Who", "Hospital", "Action", "Outcome", "Flags"];
const LABEL = "Audit log events";

/** "This entry can't be displayed · ev_9 · #42": never its content. */
export const undisplayableLine = (r: Undisplayable): string =>
  ["This entry can't be displayed", r.id, r.seq === null ? null : `#${r.seq}`]
    .filter(Boolean)
    .join(" · ");

const OUTCOME_ICON: Record<Outcome, typeof Ban> = {
  succeeded: CheckCircle2,
  refused: Ban,
  failed: CircleAlert,
};

function OutcomeMark({ e }: { e: AuditEvent }) {
  const Icon = OUTCOME_ICON[e.outcome];
  return (
    <span className="inline-flex items-start gap-1.5">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {outcomeWords(e.outcome, e.reason)}
    </span>
  );
}

/** The flag and the after-a-failure warning, each with an icon and words. */
function Flags({ e }: { e: AuditEvent }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {e.flag === "security" && (
        <span className="inline-flex items-center gap-1.5 font-semibold text-bad-deep">
          <ShieldAlert aria-hidden className="size-3.5" />
          Security
        </span>
      )}
      {e.flag === "policy" && (
        <span className="inline-flex items-center gap-1.5 font-semibold text-warn-deep">
          <Flag aria-hidden className="size-3.5" />
          Policy
        </span>
      )}
      {e.after_break && (
        <Chip tone="warn">
          <TriangleAlert aria-hidden className="size-3" />
          After an integrity failure
        </Chip>
      )}
    </span>
  );
}

const When = ({ at }: { at: string }) => (
  <time dateTime={at}>{formatWhen(at)}</time>
);

/** A row's opener, when the detail is wired; plain words otherwise. */
function Opener({
  id,
  onOpen,
  className,
  children,
}: {
  id: string | null;
  onOpen?: (id: string) => void;
  className?: string;
  children: ReactNode;
}) {
  if (!onOpen || id === null)
    return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      data-row-id={id}
      onClick={() => onOpen(id)}
      className={`${className ?? ""} min-h-11 text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep`}
    >
      {children}
    </button>
  );
}

function Table({
  rows,
  onOpen,
}: {
  rows: AuditRow[];
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <caption className="sr-only">{LABEL}</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            r.ok ? (
              <tr key={r.event.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-3">
                  <When at={r.event.at} />
                </td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {whoLine(r.event.actor)}
                </td>
                <td className="px-4 py-3">{hospitalWords(r.event.hospital)}</td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  <Opener
                    id={r.event.id}
                    onOpen={onOpen}
                    className="font-semibold text-ink"
                  >
                    {eventLine(r.event)}
                  </Opener>
                </td>
                <td className="px-4 py-3">
                  <OutcomeMark e={r.event} />
                </td>
                <td className="px-4 py-3">
                  <Flags e={r.event} />
                </td>
              </tr>
            ) : (
              <tr key={`x${i}-${r.id}`} className="border-t border-line">
                <td colSpan={HEADERS.length} className="px-4 py-3 text-ink-2">
                  <Opener id={r.id} onOpen={onOpen} className="font-mono">
                    {undisplayableLine(r)}
                  </Opener>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cards({
  rows,
  onOpen,
}: {
  rows: AuditRow[];
  onOpen?: (id: string) => void;
}) {
  return (
    <ul aria-label={LABEL} className="card-v3 divide-y divide-line px-4">
      {rows.map((r, i) =>
        r.ok ? (
          <li key={r.event.id} className="py-3 text-[13.5px]">
            <Opener
              id={r.event.id}
              onOpen={onOpen}
              className="block w-full font-semibold [overflow-wrap:anywhere]"
            >
              {eventLine(r.event)}
            </Opener>
            <p className="mt-0.5 text-ink-2 [overflow-wrap:anywhere]">
              {whoLine(r.event.actor)} · {hospitalWords(r.event.hospital)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
              <When at={r.event.at} />
              <OutcomeMark e={r.event} />
              <Flags e={r.event} />
            </div>
          </li>
        ) : (
          <li key={`x${i}-${r.id}`} className="py-3 text-[13.5px] text-ink-2">
            <Opener
              id={r.id}
              onOpen={onOpen}
              className="block w-full font-mono [overflow-wrap:anywhere]"
            >
              {undisplayableLine(r)}
            </Opener>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * The count, the retention gap, then the entries (a table from `md`, cards
 * below), Load more and the states. Entries that can't be displayed show
 * only their id and position, and are reported once.
 */
export function EventsList({
  q,
  from,
  onOpen,
}: {
  q: ReturnType<typeof useAuditEvents>;
  /** The range's start, for the gap line. */
  from: string | undefined;
  onOpen?: (id: string) => void;
}) {
  const desktop = useIsDesktop();
  const net = useNeedsConnection("audit-more-offline");
  const rows = useMemo(
    () => q.data?.pages.flatMap((p) => p.events) ?? [],
    [q.data],
  );
  useReportUndisplayable(rows);
  const first = q.data?.pages[0];

  if (q.isError && !q.data)
    return (
      <CouldntLoad what="the audit log" onRetry={() => void q.refetch()} />
    );
  if (q.isPending && q.fetchStatus === "paused")
    return (
      <div
        role="status"
        className="card-v3 p-6 text-center text-[14px] text-ink-2"
      >
        You&apos;re offline. The audit log will load when you reconnect.
      </div>
    );
  if (q.isPending || !first) return <Loading label="Loading the audit log" />;

  const gap = gapLine(from, first.oldest_kept_at, first.last_checkpoint);
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-[13.5px] font-semibold">
          {countWords(first.total, first.total_capped)}
        </p>
        {gap && <p className="text-[13px] text-ink-2">{gap}</p>}
      </div>

      {rows.length === 0 ? (
        <Empty title="Nothing matches these filters" />
      ) : desktop ? (
        <Table rows={rows} onOpen={onOpen} />
      ) : (
        <Cards rows={rows} onOpen={onOpen} />
      )}

      {q.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-lilac-2 bg-white px-4 py-3 text-[13.5px]"
        >
          <span>
            Couldn&apos;t refresh the audit log. Showing what was loaded.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())
            }
          >
            Try again
          </Button>
        </div>
      )}

      {q.hasNextPage && (
        <div className="flex flex-col items-center">
          <Button
            variant="ghost"
            disabled={q.isFetchingNextPage || net.offline}
            aria-busy={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
            {...net.props}
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
          <OfflineNote id="audit-more-offline" />
        </div>
      )}
    </div>
  );
}
