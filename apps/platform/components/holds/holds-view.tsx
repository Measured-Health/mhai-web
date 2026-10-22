"use client";
import { Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import type { HoldStatusFilter } from "@/lib/api/holds-contract";
import { platformError } from "@/lib/errors";
import { HOLD_FILTERS, holdFilterLabel, holdIsKnown } from "@/lib/holds/labels";
import { useHospitalOptions } from "@/lib/queries/activity";
import { useHolds } from "@/lib/queries/holds";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { HoldsCards } from "./holds-cards";
import { HoldsTable } from "./holds-table";
import { PlaceHoldDialog } from "./place-hold-dialog";

/** Place a hold: a button when online, disabled and saying why when not. */
function PlaceAction({ onClick }: { onClick(): void }) {
  const net = useNeedsConnection("place-offline");
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} {...net.props}>
        <Plus aria-hidden className="size-4" />
        Place a hold
      </Button>
      {net.offline && (
        <div className="text-[12px] text-white/90">
          <OfflineNote id="place-offline" />
        </div>
      )}
    </div>
  );
}

const asStatus = (v: string | null): HoldStatusFilter =>
  HOLD_FILTERS.find((s) => s === v) ?? "open";

/**
 * The legal holds, newest first. The filters live in the URL (opaque ids
 * and filter words only), so a link such as a hospital's "View holds" opens
 * the right list.
 */
export function HoldsView() {
  const { user } = useAuth();
  const desktop = useIsDesktop();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = asStatus(params.get("status"));
  const hospital = params.get("hospital") || undefined;
  const q = params.get("q") ?? "";
  const [placing, setPlacing] = useState(false);
  const options = useHospitalOptions();
  const list = useHolds({ status, hospital, q });

  /** Changes some filters, keeping the rest. */
  const go = (change: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(change))
      if (v) next.set(k, v);
      else next.delete(k);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });

  // Ask the service once typing pauses, not on every key.
  const [search, setSearch] = useState(q);
  // Back and Forward change `q` under the box; follow them unless the person
  // is typing (an echo of an earlier pause must not undo later keys).
  const [typing, setTyping] = useState(false);
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (!typing) setSearch(q);
  }
  useEffect(() => {
    if (search.trim() === q.trim()) return;
    const t = setTimeout(
      () => goRef.current({ q: search.trim() || undefined }),
      250,
    );
    return () => clearTimeout(t);
  }, [search, q]);

  const rows = list.data ?? [];
  const names = options.data ?? [];
  const unknown =
    !!hospital && options.isSuccess && !names.some((h) => h.id === hospital);
  const filtered = status !== "open" || !!hospital || q.trim() !== "";
  const waiting = list.isPending && list.fetchStatus === "paused";
  const List = desktop ? HoldsTable : HoldsCards;
  const failed = list.isError && !list.data;
  // A code this app has no words for fails the block, never printed raw.
  const strange = rows.some((h) => !holdIsKnown(h));

  return (
    <>
      <TopBar
        title="Legal holds"
        sub="Records kept for a case or an inspection"
        actions={
          isPlatformAdmin(user) ? (
            <PlaceAction onClick={() => setPlacing(true)} />
          ) : undefined
        }
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
                aria-label="Search by reference"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                placeholder="Search by reference"
                className={`${inputClass} pl-9`}
              />
            </div>
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <span aria-hidden>Status</span>
              <select
                aria-label="Status"
                value={status}
                onChange={(e) =>
                  go({
                    status:
                      e.target.value === "open" ? undefined : e.target.value,
                  })
                }
                className={`${inputClass} w-auto`}
              >
                {HOLD_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {holdFilterLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <span aria-hidden>Hospital</span>
              <select
                aria-label="Hospital"
                value={hospital ?? ""}
                disabled={options.isPending}
                onChange={(e) => go({ hospital: e.target.value || undefined })}
                className={`${inputClass} w-auto max-w-[220px]`}
              >
                <option value="">
                  {options.isPending ? "Loading hospitals…" : "All hospitals"}
                </option>
                {unknown && <option value={hospital}>Unknown hospital</option>}
                {names.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {failed || strange ? (
            <CouldntLoad
              what="legal holds"
              onRetry={() => void list.refetch()}
            />
          ) : waiting ? (
            <div
              role="status"
              className="card-v3 p-6 text-center text-[14px] text-ink-2"
            >
              You&apos;re offline. Legal holds will load when you reconnect.
            </div>
          ) : list.isPending ? (
            <Loading label="Loading legal holds" />
          ) : rows.length === 0 ? (
            <Empty title="No legal holds">
              {filtered ? (
                <>
                  Nothing matches these filters.
                  <Button
                    variant="ghost"
                    className="mt-3"
                    onClick={() => {
                      setSearch("");
                      router.replace(pathname);
                    }}
                  >
                    Clear
                  </Button>
                </>
              ) : (
                "Records under a hold are kept until it is lifted."
              )}
            </Empty>
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
                Load more
              </Button>
            </div>
          )}
          {list.data && !strange && (
            <p role="status" className="sr-only">
              {rows.length === 1
                ? "1 legal hold shown"
                : `${rows.length} legal holds shown`}
            </p>
          )}
        </div>
      </div>
      <PlaceHoldDialog
        open={placing}
        onClose={() => setPlacing(false)}
        onPlaced={(h) =>
          router.push(`/legal-holds/${encodeURIComponent(h.id)}`)
        }
      />
    </>
  );
}
