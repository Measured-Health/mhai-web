"use client";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { HospitalStatus } from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { STATUSES, statusLabel } from "@/lib/labels";
import { useHospitals } from "@/lib/queries/hospitals";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Button } from "@mhai/ui/button";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OFFLINE_NOTE, useNeedsConnection } from "../states/offline-strip";
import { HospitalCards } from "./hospital-cards";
import { HospitalTable } from "./hospital-table";

export const ADD_OFFLINE = "You're offline. Reconnect to add a hospital.";

/** Add hospital: a link when online, a disabled button saying why when not. */
export function AddHospitalAction() {
  const net = useNeedsConnection();
  return (
    <div className="flex flex-col items-end gap-1">
      {net.offline ? (
        <Button disabled aria-describedby="add-offline" title={OFFLINE_NOTE}>
          <Plus aria-hidden className="size-4" />
          Add hospital
        </Button>
      ) : (
        <Link
          href="/hospitals/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-mint to-mint-deep px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Plus aria-hidden className="size-4" />
          Add hospital
        </Link>
      )}
      {net.offline && (
        <p id="add-offline" className="text-[12px] text-white/90">
          {ADD_OFFLINE}
        </p>
      )}
    </div>
  );
}

export function HospitalsView() {
  const { user } = useAuth();
  const desktop = useIsDesktop();
  const [status, setStatus] = useState<HospitalStatus | "">("");
  const [search, setSearch] = useState("");
  // Ask the service once typing pauses, not on every key.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = useHospitals({ status: status || undefined, q });
  const rows = list.data ?? [];
  const filtered = status !== "" || q.trim() !== "";
  const clear = () => {
    setStatus("");
    setSearch("");
    setQ("");
  };
  const waiting = list.isPending && list.fetchStatus === "paused";
  const List = desktop ? HospitalTable : HospitalCards;

  return (
    <>
      <TopBar
        title="Hospitals"
        sub="Every hospital on MHAI"
        actions={isPlatformAdmin(user) ? <AddHospitalAction /> : undefined}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex min-w-[220px] flex-1 items-center">
              <Search
                aria-hidden
                className="absolute left-3 size-4 text-ink-3"
              />
              <input
                type="search"
                aria-label="Search hospitals"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or short code"
                className={`${inputClass} pl-9`}
              />
            </div>
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <span aria-hidden>Status</span>
              <select
                aria-label="Status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as HospitalStatus | "")
                }
                className={`${inputClass} w-auto`}
              >
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {list.isError && !list.data ? (
            <CouldntLoad what="hospitals" onRetry={() => void list.refetch()} />
          ) : waiting ? (
            <div
              role="status"
              className="card-v3 p-6 text-center text-[14px] text-ink-2"
            >
              You&apos;re offline. Hospitals will load when you reconnect.
            </div>
          ) : list.isPending ? (
            <Loading label="Loading hospitals" />
          ) : rows.length === 0 ? (
            filtered ? (
              <Empty title="No hospitals match">
                <Button variant="ghost" className="mt-3" onClick={clear}>
                  Clear
                </Button>
              </Empty>
            ) : (
              <Empty title="No hospitals yet" />
            )
          ) : (
            <List rows={rows} />
          )}

          {list.isError && list.data && (
            <p role="alert" className="mt-3 text-[13px] text-bad">
              {platformError(list.error).title}
            </p>
          )}
          {list.hasNextPage && (
            <div className="mt-4 text-center">
              <Button
                variant="ghost"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}
          {list.data && (
            <p role="status" className="sr-only">
              {rows.length === 1
                ? "1 hospital shown"
                : `${rows.length} hospitals shown`}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
