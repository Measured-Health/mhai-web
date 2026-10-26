"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { actionLabel, formatWhen } from "@/lib/activity-labels";
import { useActivityFeed, useHospitalOptions } from "@/lib/queries/activity";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { AccessTrail } from "./access-trail";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";

const ACCESS = "analysis-access";
type Tab = "team" | typeof ACCESS;
const TABS: { key: Tab; label: string }[] = [
  { key: "team", label: "Team actions" },
  { key: ACCESS, label: "Analysis access" },
];
/** The Analysis switches say their position in the line, so no detail below. */
const SAYS_POSITION = new Set(["analysis_switched", "patient_views_switched"]);

/** What the team has done, newest first, and who used Analysis. */
export function ActivityView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hospital = params.get("hospital") || undefined;
  const tab: Tab = params.get("tab") === ACCESS ? ACCESS : "team";
  const selectId = useId();
  const options = useHospitalOptions();
  const names = options.data ?? [];
  const unknown =
    !!hospital && options.isSuccess && !names.some((h) => h.id === hospital);
  const loadingOptions = options.isPending;

  /** Only the tab and the hospital's id are ever in the URL. */
  function go(next: Tab, id: string | undefined) {
    const qs = new URLSearchParams();
    if (next === ACCESS) qs.set("tab", ACCESS);
    if (id) qs.set("hospital", id);
    const text = qs.toString();
    router.replace(text ? `${pathname}?${text}` : pathname);
  }
  const choose = (id: string) => go(tab, id || undefined);

  return (
    <>
      <TopBar title="Activity" sub="What the team has done" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[860px] flex-col gap-4">
          <div
            role="tablist"
            aria-label="Activity"
            className="flex gap-1 border-b border-line"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => go(key, hospital)}
                className={cn(
                  "min-h-11 shrink-0 border-b-2 px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
                  tab === key
                    ? "border-mint-deep text-ink"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="text-[13px] text-ink-2">
              Hospital
            </label>
            <select
              id={selectId}
              value={hospital ?? ""}
              disabled={loadingOptions}
              onChange={(e) => choose(e.target.value)}
              className={control}
            >
              <option value="">
                {loadingOptions ? "Loading hospitals…" : "All hospitals"}
              </option>
              {unknown && <option value={hospital}>Unknown hospital</option>}
              {names.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          {tab === "analysis-access" ? (
            <AccessTrail hospital={hospital} />
          ) : (
            <TeamActions hospital={hospital} />
          )}
        </div>
      </div>
    </>
  );
}

/** The team's actions, one hospital or all. */
function TeamActions({ hospital }: { hospital?: string }) {
  const q = useActivityFeed({ hospital });
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  return (
    <>
      {q.isError && !q.data ? (
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
        <ul aria-label="Activity" className="card-v3 divide-y divide-line px-4">
          {events.map((e) => (
            <li key={e.id} className="py-3 text-[14px]">
              <p className="[overflow-wrap:anywhere]">
                <strong className="font-semibold">{e.actor.name}</strong>{" "}
                {actionLabel(e.action, e.target, e.reason, e.detail)}
                {e.hospital && ` · ${e.hospital.name}`}
                {" · "}
                <time dateTime={e.at}>{formatWhen(e.at)}</time>
              </p>
              {e.detail && !SAYS_POSITION.has(e.action) && (
                <p className="mt-0.5 text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
                  {e.detail}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {q.isError && q.data && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-lilac-2 bg-white px-4 py-3 text-[13.5px]"
        >
          <span>
            Couldn&apos;t refresh the activity. Showing what was loaded.
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
