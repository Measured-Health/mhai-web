"use client";
import { Download, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ActivityEventOut, ActivityType } from "@/lib/api/admin-contract";
import {
  fetchAllActivity,
  useActivity,
  type ActivityFilter,
} from "@/lib/admin-queries";
import {
  ACTIVITY_KEEP_MONTHS,
  ACTIVITY_RANGES,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  actorName,
  describeEvent,
  rangeStart,
  typeLabel,
  type ActivityRange,
} from "@/lib/admin/activity";
import { eventClock } from "@/lib/time";
import {
  CSV_MAX_ROWS,
  activityCsv,
  csvName,
  downloadCsv,
} from "@/lib/admin/csv";
import { adminError } from "@/lib/admin/errors";
import { countLabel } from "@/lib/admin/report";
import { useAuth } from "@/lib/auth/auth-context";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { useNow } from "@/lib/hooks/use-now";
import { useOnline } from "@/lib/hooks/use-online";
import { FilterChip } from "../corrections/filter-chip";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { ActivityTabs } from "./activity-tabs";
import { AdminFrame } from "./admin-frame";
import { FlagChip } from "./chips";

/** The value, once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";

function What({ e }: { e: ActivityEventOut }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 [overflow-wrap:anywhere]">
      <span>{describeEvent(e)}</span>
      {e.flag && <FlagChip flag={e.flag} />}
    </span>
  );
}

/** What happened at the hospital (hospital-admin.html tab 6). */
export function ActivityView() {
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const online = useOnline();
  const toast = useToast();
  const typeId = useId();
  const datesId = useId();
  const offlineId = useId();
  const [person, setPerson] = useState("");
  const settledPerson = useSettled(person.trim(), 300);
  const [type, setType] = useState<ActivityType | "">("");
  const [range, setRange] = useState<ActivityRange>("7d");
  const [from, setFrom] = useState(() => rangeStart("7d", Date.now()));
  const [flagged, setFlagged] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hospital = user?.hospital ?? "Hospital";

  const filter: ActivityFilter = {
    from,
    ...(type ? { type } : {}),
    ...(settledPerson ? { person: settledPerson } : {}),
    ...(flagged ? { flagged: true } : {}),
  };
  const q = useActivity(filter);
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  const failed = q.isError ? adminError(q.error) : null;
  const waiting = q.isPending && !q.isError && q.fetchStatus === "paused";
  const offlineNote = "You're offline. Reconnect to export or load more.";

  async function exportCsv() {
    if (!online) return;
    setExporting(true);
    try {
      const all = await fetchAllActivity(filter, CSV_MAX_ROWS);
      downloadCsv(
        csvName("activity", hospital, Date.now()),
        activityCsv(all.events),
      );
      toast.show({
        title: "Activity exported",
        body: all.capped
          ? `Only the newest ${countLabel(CSV_MAX_ROWS)} events are in the file. Narrow the dates to export older ones.`
          : `${countLabel(all.events.length)} events. No clinical content is in the file.`,
        tone: "ok",
      });
    } catch (e) {
      toast.show({
        title: "Couldn't export the activity",
        body: adminError(e).body,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminFrame
      title="Activity"
      actions={
        <Button
          variant="ghost"
          disabled={!online || exporting || !q.data}
          aria-describedby={online ? undefined : offlineId}
          onClick={() => void exportCsv()}
        >
          <Download aria-hidden className="size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      }
    >
      <ActivityTabs current="log" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[200px] flex-1 items-center">
          <Search aria-hidden className="absolute left-3 size-4 text-ink-3" />
          <span className="sr-only">Filter by person</span>
          <input
            type="search"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            placeholder="Filter by person"
            className={`${control} w-full pl-9`}
          />
        </label>
        <label htmlFor={typeId} className="sr-only">
          Type
        </label>
        <select
          id={typeId}
          value={type}
          onChange={(e) => setType(e.target.value as ActivityType | "")}
          className={control}
        >
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label htmlFor={datesId} className="sr-only">
          Dates
        </label>
        <select
          id={datesId}
          value={range}
          onChange={(e) => {
            const r = e.target.value as ActivityRange;
            setRange(r);
            setFrom(rangeStart(r, Date.now()));
          }}
          className={control}
        >
          {ACTIVITY_RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <FilterChip pressed={flagged} onClick={() => setFlagged((f) => !f)}>
          Flagged only
        </FilterChip>
      </div>
      {!online && (
        <p id={offlineId} className="mb-3 text-[12px] text-ink-3">
          {offlineNote}
        </p>
      )}

      {failed && (
        <div className="mb-4">
          <Banner tone="bad" title={failed.title}>
            {failed.body}
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </span>
          </Banner>
        </div>
      )}
      {waiting ? (
        <div
          role="status"
          className="card-v3 p-6 text-center text-[14px] text-ink-2"
        >
          You&apos;re offline. The activity will load when you reconnect.
        </div>
      ) : q.isPending ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : !q.data ? null : events.length === 0 ? (
        <p className="card-v3 p-6 text-center text-[14px] text-ink-2">
          Nothing matches these filters.
        </p>
      ) : desktop ? (
        <div className="card-v3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <caption className="sr-only">Activity at the hospital</caption>
            <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
              <tr>
                {["Time (local)", "Who", "Type", "What happened"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-ink-3">
                    {eventClock(e.at, now)}
                  </td>
                  <td className="px-4 py-3 [overflow-wrap:anywhere]">
                    {actorName(e)}
                  </td>
                  <td className="px-4 py-3">{typeLabel(e)}</td>
                  <td className="px-4 py-3">
                    <What e={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul
          aria-label="Activity at the hospital"
          className="flex flex-col gap-2"
        >
          {events.map((e) => (
            <li key={e.id} className="card-v3 p-3.5 text-[13px]">
              <span className="flex flex-wrap gap-x-2 text-[12px] text-ink-3">
                <span className="font-mono">{eventClock(e.at, now)}</span>
                <span>{typeLabel(e)}</span>
                <span className="[overflow-wrap:anywhere]">{actorName(e)}</span>
              </span>
              <span className="mt-1 block">
                <What e={e} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            disabled={!online || q.isFetchingNextPage}
            aria-describedby={online ? undefined : offlineId}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-3">
        Kept for {ACTIVITY_KEEP_MONTHS} months. No question text, results or
        patient details are recorded here.
      </p>
      <p className="mt-1 text-[12.5px] text-ink-3">
        Times on screen are in your local time. The CSV file uses UTC.
      </p>
    </AdminFrame>
  );
}
