"use client";
import {
  Ban,
  CalendarX,
  CircleCheck,
  CircleX,
  Clock,
  Hourglass,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { dayLabel } from "@mhai/ui/clearances";
import type { Clearance, ClearanceTab } from "@/lib/api/clearances-contract";
import { platformError } from "@/lib/errors";
import { statusText, type StatusIcon } from "@/lib/clearances/labels";
import { TABS, waitingText } from "@/lib/clearances/queue";
import { instantDay } from "@/lib/clearances/switch";
import { useClearances } from "@/lib/queries/clearances";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";

const ICONS: Record<StatusIcon, LucideIcon> = {
  clock: Clock,
  x: CircleX,
  hourglass: Hourglass,
  check: CircleCheck,
  alert: TriangleAlert,
  ban: Ban,
  "calendar-x": CalendarX,
};

/** A status: always an icon and words, never colour alone. */
export function StatusWords({
  icon,
  words,
  className,
}: {
  icon: StatusIcon;
  words: string;
  className?: string;
}) {
  const I = ICONS[icon];
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <I aria-hidden data-icon={icon} className="size-4 shrink-0" />
      <span>{words}</span>
    </span>
  );
}

/** A letter day as "12 Mar 2027", or a dash if it isn't one. */
export function safeDay(ymd: string): string {
  try {
    return dayLabel(ymd);
  } catch {
    return "—";
  }
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Everyone a letter names: hospital staff and platform admins together. */
export const coveredCount = (c: Clearance) =>
  c.covered.length + c.covered_platform.length;

function Row({
  c,
  tab,
  today,
  now,
  selected,
  onSelect,
  rowRef,
}: {
  c: Clearance;
  tab: ClearanceTab;
  today: string;
  now: number;
  selected: boolean;
  onSelect(): void;
  rowRef(el: HTMLButtonElement | null): void;
}) {
  const uploaded = instantDay(c.uploaded_at);
  const status =
    tab === "waiting" && c.status === "waiting"
      ? { icon: "hourglass" as const, words: waitingText(c, now) }
      : statusText(c, today);
  return (
    <button
      ref={rowRef}
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep",
        selected
          ? "border-ink bg-white shadow-sm"
          : "border-line bg-white hover:border-lilac-2",
      )}
    >
      <span className="text-[14.5px] font-semibold [overflow-wrap:anywhere]">
        {c.hospital.name}
      </span>
      <span className="text-[13px] text-ink-2">
        {people(coveredCount(c))} · until {safeDay(c.end_date)}
      </span>
      <span className="text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
        {uploaded
          ? `Uploaded by ${c.uploaded_by.name} · ${uploaded}`
          : `Uploaded by ${c.uploaded_by.name}`}
      </span>
      <StatusWords
        {...status}
        className="text-[13px] font-semibold text-ink-2"
      />
    </button>
  );
}

/**
 * The letters, by tab: To verify (oldest first, the default), Active,
 * Ending soon and All. Each row is a button that shows the letter beside
 * the queue (or in its place on a phone). Which letter is open is the
 * page's state, never the URL.
 */
export function ClearanceQueue({
  tab,
  onTab,
  selected,
  onSelect,
  today,
  rowRefs,
}: {
  tab: ClearanceTab;
  onTab(t: ClearanceTab): void;
  selected: string | null;
  onSelect(id: string): void;
  /** The viewer's day, for the status words. */
  today: string;
  /** The rows' buttons by letter id, so Back can refocus one. */
  rowRefs: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const base = useId();
  const tabRefs = useRef(new Map<ClearanceTab, HTMLButtonElement>());
  const [now] = useState(() => Date.now());
  const list = useClearances(tab);

  function move(e: KeyboardEvent, i: number) {
    const n = TABS.length;
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowLeft"
          ? (i + n - 1) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = TABS[to]!.id;
    onTab(next);
    tabRefs.current.get(next)?.focus();
  }

  const rows = list.data ?? [];
  const waiting = list.isPending && list.fetchStatus === "paused";
  const failed = list.isError && !list.data;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        role="tablist"
        aria-label="Letter queue"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el);
              else tabRefs.current.delete(t.id);
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "min-h-11 shrink-0 border-b-2 px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
              tab === t.id
                ? "border-mint-deep text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${tab}`}
      >
        {failed ? (
          <CouldntLoad what="letters" onRetry={() => void list.refetch()} />
        ) : waiting ? (
          <div
            role="status"
            className="card-v3 p-6 text-center text-[14px] text-ink-2"
          >
            You&apos;re offline. Letters will load when you reconnect.
          </div>
        ) : list.isPending ? (
          <Loading label="Loading letters" />
        ) : rows.length === 0 ? (
          <Empty
            title={tab === "waiting" ? "No letters waiting" : "No letters"}
          />
        ) : (
          <ul aria-label="Letters" className="flex flex-col gap-2">
            {rows.map((c) => (
              <li key={c.id}>
                <Row
                  c={c}
                  tab={tab}
                  today={today}
                  now={now}
                  selected={selected === c.id}
                  onSelect={() => onSelect(c.id)}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(c.id, el);
                    else rowRefs.current.delete(c.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {list.isError && list.data && (
          <p role="alert" className="mt-3 text-[13px] text-bad">
            {platformError(list.error).title}
          </p>
        )}
        {list.hasNextPage && (
          <div className="mt-3 text-center">
            <Button
              variant="ghost"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
