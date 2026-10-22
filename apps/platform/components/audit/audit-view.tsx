"use client";
import { ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { headerLine, type Tone } from "@/lib/audit/integrity";
import { takeAuditTab, type AuditTab } from "@/lib/audit/nav";
import { useIntegrityStatus } from "@/lib/queries/audit";
import { cn } from "@mhai/ui/cn";
import { useNow } from "@mhai/ui/hooks/use-now";
import { TopBar } from "../shell/top-bar";
import { AuditFooter } from "./audit-footer";
import { AuditTabs } from "./audit-tabs";
import { initialEvents, type EventsState } from "./event-filters";
import { EventsTab } from "./events-tab";

const TONE: Record<Tone, { Icon: typeof ShieldCheck; className: string }> = {
  ok: { Icon: ShieldCheck, className: "bg-ok-wash text-ok-deep" },
  warn: { Icon: TriangleAlert, className: "bg-warn-wash text-warn-deep" },
  bad: { Icon: ShieldAlert, className: "bg-bad-wash text-bad-deep" },
};

/** "Integrity: Intact · checked 06:00 today": opens the Integrity tab. */
function IntegrityLine({
  status,
  onOpen,
}: {
  status: ReturnType<typeof useIntegrityStatus>;
  onOpen(): void;
}) {
  const now = useNow();
  const line = status.data
    ? headerLine(status.data, now)
    : status.isError
      ? { tone: "warn" as const, words: "Integrity: Couldn't check" }
      : null;
  const tone = line ? TONE[line.tone] : null;
  return (
    <div aria-live="polite" className="min-h-11">
      {line && tone && (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep",
            tone.className,
          )}
        >
          <tone.Icon aria-hidden className="size-4 shrink-0" />
          {line.words}
        </button>
      )}
    </div>
  );
}

/**
 * The audit log (spec §6): the integrity line, the tabs and the footer. The
 * open tab and every filter live here, in memory: /audit never gains a
 * query string, and nothing goes in browser storage.
 */
export function AuditView() {
  // A tab handed off by the bell or the banner, read once.
  const [handoff] = useState(takeAuditTab);
  const [tab, setTab] = useState<AuditTab>(handoff?.tab ?? "events");
  const [events, setEvents] = useState<EventsState>(() =>
    initialEvents(Date.now()),
  );
  const status = useIntegrityStatus();

  return (
    <>
      <TopBar title="Audit log" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <IntegrityLine status={status} onOpen={() => setTab("integrity")} />
            {/* Slot: Export CSV. */}
          </div>
          {/* Slot: the integrity failure banner. */}
          <AuditTabs tab={tab} onTab={setTab}>
            {(t) =>
              t === "events" ? (
                <EventsTab value={events} onChange={setEvents} />
              ) : null
            }
          </AuditTabs>
          <AuditFooter oldestKeptAt={status.data?.oldest_kept_at ?? null} />
        </div>
      </div>
    </>
  );
}
