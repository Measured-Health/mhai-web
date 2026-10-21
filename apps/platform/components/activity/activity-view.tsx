"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { actionLabel, formatWhen } from "@/lib/activity-labels";
import { useActivityFeed, useHospitalOptions } from "@/lib/queries/activity";
import { Button } from "@mhai/ui/button";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/** What the team has done, newest first. */
export function ActivityView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hospital = params.get("hospital") || undefined;
  const selectId = useId();
  const options = useHospitalOptions();
  const q = useActivityFeed({ hospital });
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  const names = options.data ?? [];
  const known = !hospital || names.some((h) => h.id === hospital);

  function choose(id: string) {
    router.replace(
      id ? `${pathname}?hospital=${encodeURIComponent(id)}` : pathname,
    );
  }

  return (
    <>
      <TopBar title="Activity" sub="What the team has done" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[860px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="text-[13px] text-ink-2">
              Hospital
            </label>
            <select
              id={selectId}
              value={hospital ?? ""}
              onChange={(e) => choose(e.target.value)}
              className={control}
            >
              <option value="">All hospitals</option>
              {!known && <option value={hospital}>{hospital}</option>}
              {names.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {q.isError ? (
            <CouldntLoad what="activity" onRetry={() => void q.refetch()} />
          ) : q.isPending ? (
            <Loading label="Loading activity" />
          ) : events.length === 0 ? (
            <Empty title="No activity yet.">
              {hospital
                ? "Nothing has been done for this hospital."
                : "What the team does will show here."}
            </Empty>
          ) : (
            <ul
              aria-label="Activity"
              className="card-v3 divide-y divide-line px-4"
            >
              {events.map((e) => (
                <li key={e.id} className="py-3 text-[14px]">
                  <p className="[overflow-wrap:anywhere]">
                    <strong className="font-semibold">{e.actor.name}</strong>{" "}
                    {actionLabel(e.action, e.target)}
                    {e.hospital && ` · ${e.hospital.name}`}
                    {` · ${formatWhen(e.at)}`}
                  </p>
                  {e.detail && (
                    <p className="mt-0.5 text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
                      {e.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {q.hasNextPage && (
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
        </div>
      </div>
    </>
  );
}
