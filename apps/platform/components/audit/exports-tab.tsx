"use client";
import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import type { ExportRecord } from "@/lib/api/audit-contract";
import { formatWhen } from "@/lib/activity-labels";
import { REASON_WORDS } from "@/lib/audit/kinds";
import type { ExportRow } from "@/lib/audit/read";
import { filtersInWords } from "@/lib/audit/words";
import { num } from "@/lib/format";
import { useExports } from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useNow } from "@mhai/ui/hooks/use-now";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { CopyButton } from "./copy-button";

const HEADERS = [
  "When",
  "Who",
  "What",
  "Reason",
  "Filters",
  "Rows",
  "Checksum",
  "Downloaded",
];
const LABEL = "Audit exports";

const WHAT: Record<ExportRecord["kind"], string> = {
  events: "Events",
  named_access: "Named access",
};

/** "{when}", "Not downloaded" or "Expired". */
function downloadedWords(r: ExportRecord, now: number): string {
  if (r.downloaded_at) return formatWhen(r.downloaded_at);
  return now >= Date.parse(r.expires_at) ? "Expired" : "Not downloaded";
}

const When = ({ at }: { at: string }) => (
  <time dateTime={at}>{formatWhen(at)}</time>
);

function What({ r }: { r: ExportRecord }) {
  return (
    <>
      <span className="block">{WHAT[r.kind]}</span>
      <span className="block font-mono text-[12px] text-ink-2">{r.id}</span>
    </>
  );
}

function Reason({ r }: { r: ExportRecord }) {
  return (
    <>
      <span className="block">{REASON_WORDS[r.reason]}</span>
      {r.reason === "other" && r.note && (
        <span className="block whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
          {r.note}
        </span>
      )}
      {r.reference && (
        <span className="block text-ink-2 [overflow-wrap:anywhere]">
          Reference {r.reference}
        </span>
      )}
    </>
  );
}

function Rows({ r }: { r: ExportRecord }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {num(r.rows)}
      {r.capped && (
        <span className="inline-flex items-center gap-1 font-semibold text-warn-deep">
          <TriangleAlert aria-hidden className="size-3.5" />
          capped
        </span>
      )}
    </span>
  );
}

function Checksum({ r }: { r: ExportRecord }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <code className="font-mono text-[12.5px]">{r.checksum.slice(0, 12)}</code>
      <CopyButton value={r.checksum} label="checksum" />
    </span>
  );
}

const undisplayable = (id: string | null) =>
  ["This entry can't be displayed", id].filter(Boolean).join(" · ");

function Table({ rows, now }: { rows: ExportRow[]; now: number }) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-[13px]">
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
          {rows.map((x, i) =>
            x.ok ? (
              <tr key={x.record.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-3">
                  <When at={x.record.at} />
                </td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {x.record.by.name}
                </td>
                <td className="px-4 py-3">
                  <What r={x.record} />
                </td>
                <td className="px-4 py-3">
                  <Reason r={x.record} />
                </td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {filtersInWords(x.record.filters, x.record.filter_names)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Rows r={x.record} />
                </td>
                <td className="px-4 py-3">
                  <Checksum r={x.record} />
                </td>
                <td className="px-4 py-3">{downloadedWords(x.record, now)}</td>
              </tr>
            ) : (
              <tr key={`x${i}-${x.id}`} className="border-t border-line">
                <td
                  colSpan={HEADERS.length}
                  className="px-4 py-3 font-mono text-ink-2"
                >
                  {undisplayable(x.id)}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ rows, now }: { rows: ExportRow[]; now: number }) {
  return (
    <ul aria-label={LABEL} className="card-v3 divide-y divide-line px-4">
      {rows.map((x, i) =>
        x.ok ? (
          <li key={x.record.id} className="py-3 text-[13.5px]">
            <p className="font-semibold">
              <What r={x.record} />
            </p>
            <p className="mt-0.5 text-ink-2 [overflow-wrap:anywhere]">
              {x.record.by.name} · <When at={x.record.at} />
            </p>
            <div className="mt-1">
              <Reason r={x.record} />
            </div>
            <p className="mt-1 text-ink-2 [overflow-wrap:anywhere]">
              {filtersInWords(x.record.filters, x.record.filter_names)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-ink-2">
              <Rows r={x.record} />
              <span>{downloadedWords(x.record, now)}</span>
            </div>
            <Checksum r={x.record} />
          </li>
        ) : (
          <li
            key={`x${i}-${x.id}`}
            className="py-3 font-mono text-[13.5px] text-ink-2 [overflow-wrap:anywhere]"
          >
            {undisplayable(x.id)}
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Exports (spec §7): every export made, with who, why, what, its checksum
 * and whether it was downloaded. Read-only: a file can be downloaded only
 * from the ready step of the dialog that made it.
 */
export function ExportsTab() {
  const q = useExports();
  const desktop = useIsDesktop();
  const now = useNow();
  const net = useNeedsConnection("exports-more-offline");
  const rows = useMemo(
    () => q.data?.pages.flatMap((p) => p.exports) ?? [],
    [q.data],
  );

  if (q.isError && !q.data)
    return <CouldntLoad what="the exports" onRetry={() => void q.refetch()} />;
  if (q.isPending && q.fetchStatus === "paused")
    return (
      <div
        role="status"
        className="card-v3 p-6 text-center text-[14px] text-ink-2"
      >
        You&apos;re offline. The exports will load when you reconnect.
      </div>
    );
  if (q.isPending) return <Loading label="Loading the exports" />;

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <Empty title="No exports yet" />
      ) : desktop ? (
        <Table rows={rows} now={now} />
      ) : (
        <Cards rows={rows} now={now} />
      )}
      {q.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-lilac-2 bg-white px-4 py-3 text-[13.5px]"
        >
          <span>
            Couldn&apos;t refresh the exports. Showing what was loaded.
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
          <OfflineNote id="exports-more-offline" />
        </div>
      )}
    </div>
  );
}
