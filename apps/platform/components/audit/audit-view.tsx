"use client";
import {
  Download,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { headerLine, type Tone } from "@/lib/audit/integrity";
import { takeAuditTab, type AuditTab } from "@/lib/audit/nav";
import { countWords } from "@/lib/audit/words";
import {
  useAuditEvents,
  useAuditHospitals,
  useIntegrityStatus,
} from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { useNow } from "@mhai/ui/hooks/use-now";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { TopBar } from "../shell/top-bar";
import { AuditFooter } from "./audit-footer";
import { AuditTabs } from "./audit-tabs";
import { filtersOf, initialEvents, type EventsState } from "./event-filters";
import { EventsTab } from "./events-tab";
import { ExportDialog } from "./export-dialog";
import { ExportsTab } from "./exports-tab";

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
 * Export CSV: the Events tab's current filters, with their count. Off while
 * offline, and while the dates can't be used.
 */
function ExportEvents({ events }: { events: EventsState }) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const net = useNeedsConnection("audit-export-offline");
  const built = filtersOf(events, now);
  const filters = "filters" in built ? built.filters : null;
  // The same query as the list's (one cache entry): only its count is used.
  const list = useAuditEvents(filters ?? {}, filters !== null);
  const hospitals = useAuditHospitals();
  const first = list.data?.pages[0];
  const hospital =
    hospitals.data?.find((h) => h.id === events.hospital)?.name ?? null;
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        disabled={filters === null}
        onClick={() => setOpen(true)}
        {...net.props}
      >
        <Download aria-hidden className="size-4" />
        Export CSV
      </Button>
      <OfflineNote id="audit-export-offline" />
      {filters && (
        <ExportDialog
          kind="events"
          filters={filters}
          names={{ hospital, person: events.person?.name ?? null }}
          count={first ? countWords(first.total, first.total_capped) : null}
          open={open}
          onClose={() => setOpen(false)}
        />
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
            <ExportEvents events={events} />
          </div>
          {/* Slot: the integrity failure banner. */}
          <AuditTabs tab={tab} onTab={setTab}>
            {(t) =>
              t === "events" ? (
                <EventsTab value={events} onChange={setEvents} />
              ) : t === "exports" ? (
                <ExportsTab />
              ) : null
            }
          </AuditTabs>
          <AuditFooter oldestKeptAt={status.data?.oldest_kept_at ?? null} />
        </div>
      </div>
    </>
  );
}
