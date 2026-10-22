"use client";
import {
  Download,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { headerLine, type Tone } from "@/lib/audit/integrity";
import { useQueryClient } from "@tanstack/react-query";
import type { AuditFilters, ExportReason } from "@/lib/api/audit-contract";
import { checkCustomRange } from "@/lib/audit/dates";
import { takeAuditTab, type AuditTab } from "@/lib/audit/nav";
import type { FilterNames } from "@/lib/audit/words";
import {
  cachedEventsCount,
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
import { IntegrityBanner } from "./integrity-banner";
import { IntegrityTab, type ExportPrefill } from "./integrity-tab";

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

/** What the export dialog is opened with. */
type ExportOpen = {
  filters: AuditFilters;
  names: FilterNames;
  count: string | null;
  reason?: ExportReason;
};

/**
 * Export CSV: the Events tab's current filters. Off while offline, and
 * while the dates can't be used. It observes no list: the count is read
 * from what the Events tab already loaded, once, when it is pressed.
 */
function ExportEventsButton({
  events,
  onOpen,
}: {
  events: EventsState;
  onOpen(o: ExportOpen): void;
}) {
  const qc = useQueryClient();
  const now = useNow();
  const net = useNeedsConnection("audit-export-offline");
  const built = filtersOf(events, now);
  const filters = "filters" in built ? built.filters : null;
  const hospitals = useAuditHospitals();
  const hospital =
    hospitals.data?.find((h) => h.id === events.hospital)?.name ?? null;
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        disabled={filters === null}
        onClick={() =>
          filters &&
          onOpen({
            filters,
            names: { hospital, person: events.person?.name ?? null },
            count: cachedEventsCount(qc, filters),
          })
        }
        {...net.props}
      >
        <Download aria-hidden className="size-4" />
        Export CSV
      </Button>
      <OfflineNote id="audit-export-offline" />
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
  // Integrity's Open entry: an exact id search on Events, with its detail
  // open. Read once on arrival; any tab change forgets it.
  const [entry, setEntry] = useState<string | null>(null);
  const showTab = (t: AuditTab) => {
    setEntry(null);
    setTab(t);
  };
  const [exporting, setExporting] = useState<ExportOpen | null>(null);
  // Integrity's "Export the entries around the break": whole local days,
  // sent as [from, to + 1 day), with Security investigation chosen.
  const exportAround = (p: ExportPrefill) => {
    const range = checkCustomRange(p.filters.from, p.filters.to, Date.now());
    if ("error" in range) return;
    setExporting({
      filters: { from: range.from, to: range.to },
      names: {},
      count: null,
      reason: p.reason,
    });
  };
  const openEntry = (id: string) => {
    setEvents((e) => ({ ...e, q: id }));
    setEntry(id);
    setTab("events");
  };

  return (
    <>
      <TopBar title="Audit log" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <IntegrityLine
              status={status}
              onOpen={() => showTab("integrity")}
            />
            <ExportEventsButton events={events} onOpen={setExporting} />
          </div>
          <IntegrityBanner
            onOpen={() => showTab("integrity")}
            className="rounded-2xl border px-4 py-3.5"
          />
          <AuditTabs tab={tab} onTab={showTab}>
            {(t) =>
              t === "events" ? (
                <EventsTab
                  value={events}
                  onChange={setEvents}
                  initialOpen={entry}
                />
              ) : t === "exports" ? (
                <ExportsTab />
              ) : t === "integrity" ? (
                <IntegrityTab onOpenEntry={openEntry} onExport={exportAround} />
              ) : null
            }
          </AuditTabs>
          <ExportDialog
            kind="events"
            filters={exporting?.filters ?? {}}
            names={exporting?.names ?? {}}
            count={exporting?.count ?? null}
            prefillReason={exporting?.reason}
            open={exporting !== null}
            onClose={() => setExporting(null)}
          />
          <AuditFooter oldestKeptAt={status.data?.oldest_kept_at ?? null} />
        </div>
      </div>
    </>
  );
}
