"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { useConnectionList } from "@/lib/queries/connection-list";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import {
  asFilter,
  CONNECTION_FILTERS,
  countFor,
  FILTER_EMPTY,
  FILTER_WORDS,
  rowsFor,
} from "./connection-rows";
import { ConnectionsCards } from "./connections-cards";
import { ConnectionsTable } from "./connections-table";

/**
 * Every hospital's record connections. The filter lives in the URL
 * (`?state=`), so a link opens the right list; nothing is stored.
 */
export function ConnectionsView() {
  const { user } = useAuth();
  const desktop = useIsDesktop();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = asFilter(params.get("state"));
  const list = useConnectionList();
  // Read once per mount so the times don't shift while the page is open.
  const [now] = useState(() => Date.now());

  const go = (f: string) => {
    const next = new URLSearchParams(params.toString());
    if (f === "all") next.delete("state");
    else next.set("state", f);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const data = list.data;
  const rows = data
    ? rowsFor(filter, data.connections, data.not_connected)
    : [];
  const waiting = list.isPending && list.fetchStatus === "paused";
  const List = desktop ? ConnectionsTable : ConnectionsCards;

  return (
    <>
      <TopBar
        title="Connections"
        sub="Patient record systems MHAI reads, by hospital"
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto max-w-[1100px]">
          <div
            role="group"
            aria-label="Show"
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            {CONNECTION_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={f === filter}
                onClick={() => go(f)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-[13px] font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep aria-pressed:border-mint-deep aria-pressed:bg-mint-deep aria-pressed:text-white sm:min-h-9"
              >
                {FILTER_WORDS[f]}
                {data && (
                  <span className="font-normal opacity-80">
                    {countFor(f, data.connections, data.not_connected)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {list.isError && !data ? (
            <CouldntLoad
              what="connections"
              onRetry={() => void list.refetch()}
            />
          ) : waiting ? (
            <div
              role="status"
              className="card-v3 p-6 text-center text-[14px] text-ink-2"
            >
              You&apos;re offline. Connections will load when you reconnect.
            </div>
          ) : !data ? (
            <Loading label="Loading connections" />
          ) : rows.length === 0 ? (
            <Empty title={FILTER_EMPTY[filter]} />
          ) : (
            <List rows={rows} canAdd={isPlatformAdmin(user)} now={now} />
          )}
        </div>
      </div>
    </>
  );
}
