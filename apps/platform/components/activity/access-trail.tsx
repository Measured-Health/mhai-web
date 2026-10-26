"use client";
import { Download, ShieldAlert } from "lucide-react";
import { useId, useState } from "react";
import { accessLine } from "@/lib/analysis/access";
import type { AccessKind } from "@/lib/api/analysis-contract";
import { formatWhen } from "@/lib/activity-labels";
import {
  useAnalysisAccess,
  useExportAnalysisAccess,
} from "@/lib/queries/activity";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";

const KINDS: { value: "" | AccessKind; label: string }[] = [
  { value: "", label: "All" },
  { value: "visit", label: "Visits" },
  { value: "download", label: "Downloads" },
  { value: "patient_list", label: "Patient lists" },
];

/**
 * Who looked at Analysis (platform admins and auditors both read it): newest
 * first, by the page's hospital and a kind. It never holds a figure or a
 * patient; a page the browser can't vouch for shows nothing of itself.
 */
export function AccessTrail({ hospital }: { hospital?: string }) {
  const kindId = useId();
  const [kind, setKind] = useState<"" | AccessKind>("");
  const filter = {
    ...(hospital ? { hospital } : {}),
    ...(kind ? { kind } : {}),
  };
  const q = useAnalysisAccess(filter);
  const save = useExportAnalysisAccess();
  const net = useNeedsConnection("access-export-offline");

  const pages = q.data?.pages ?? [];
  const failed = pages.some((p) => p.status === "failed");
  const entries = failed
    ? []
    : pages.flatMap((p) => (p.status === "ok" ? p.data.entries : []));

  return (
    <>
      <p className="text-[13.5px] text-ink-2">
        Who looked at Analysis. Never the figures or patients.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={kindId} className="text-[13px] text-ink-2">
          Kind
        </label>
        <select
          id={kindId}
          value={kind}
          onChange={(e) => setKind(e.target.value as "" | AccessKind)}
          className={control}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-col items-end">
          <Button
            variant="ghost"
            disabled={save.isPending}
            aria-busy={save.isPending}
            onClick={() => save.mutate(filter)}
            {...net.props}
          >
            <Download aria-hidden className="size-4" />
            Export for a legal request
          </Button>
          <OfflineNote id="access-export-offline" />
        </div>
      </div>
      {save.isError && (
        <p role="alert" className="text-[13.5px] text-bad-deep">
          Couldn&apos;t export. Try again.
        </p>
      )}

      {failed || (q.isError && !q.data) ? (
        <CouldntLoad what="Analysis access" onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Loading label="Loading Analysis access" />
      ) : entries.length === 0 ? (
        <Empty title="No Analysis access yet.">
          {hospital || kind
            ? "Nothing matches this hospital and kind."
            : "Visits, downloads and patient lists will show here."}
        </Empty>
      ) : (
        <ul
          aria-label="Analysis access"
          className="card-v3 divide-y divide-line px-4"
        >
          {entries.map((e) => (
            <li key={e.id} className="py-3 text-[14px]">
              <p className="[overflow-wrap:anywhere]">
                {e.flagged && (
                  <Chip tone="warn" className="mr-2 align-middle">
                    <ShieldAlert aria-hidden className="size-3.5" />
                    Security
                  </Chip>
                )}
                <strong className="font-semibold">{e.actor.name}</strong>
                {accessLine(e).slice(e.actor.name.length)}
                {" · "}
                <time dateTime={e.at}>{formatWhen(e.at)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}

      {q.isError && q.data && !failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-lilac-2 bg-white px-4 py-3 text-[13.5px]"
        >
          <span>
            Couldn&apos;t refresh the access trail. Showing what was loaded.
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

      {!failed && q.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            disabled={q.isFetchingNextPage}
            aria-busy={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
