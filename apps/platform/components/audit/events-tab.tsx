"use client";
import { useEffect, useRef, useState } from "react";
import type { NamedAccessFilters } from "@/lib/api/audit-contract";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useNow } from "@mhai/ui/hooks/use-now";
import { useAuditEvents, useAuditHospitals } from "@/lib/queries/audit";
import { EventFilters, filtersOf, type EventsState } from "./event-filters";
import { EventDetail } from "./event-detail";
import { EventsList } from "./events-list";

/**
 * Events: the filters, then the list for them. A new filter set replaces
 * the list; dates that can't be used are refused before anything is sent.
 */
export function EventsTab({
  value,
  onChange,
  onOpenNamed,
}: {
  value: EventsState;
  onChange(next: EventsState): void;
  onOpenNamed?: (f: NamedAccessFilters) => void;
}) {
  const desktop = useIsDesktop();
  // The open entry lives in memory only: never in the URL or in storage.
  const [open, setOpen] = useState<string | null>(null);
  const opened = useRef<string | null>(null);
  const openRow = (id: string) => {
    opened.current = id;
    setOpen(id);
  };
  // Closing returns focus to the row that was opened.
  useEffect(() => {
    if (open !== null || opened.current === null) return;
    const id = opened.current;
    opened.current = null;
    document
      .querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, [open]);
  const now = useNow();
  const hospitals = useAuditHospitals();
  const built = filtersOf(value, now);
  const error = "error" in built ? built.error : null;
  const filters = "filters" in built ? built.filters : {};
  const q = useAuditEvents(filters, error === null);

  return (
    <>
      {open !== null && (
        <EventDetail
          id={open}
          onClose={() => setOpen(null)}
          onOpenNamed={onOpenNamed}
        />
      )}
      {/* Below md the detail is a full page: the list waits, state kept. */}
      <div hidden={open !== null && !desktop} className="flex flex-col gap-5">
        <EventFilters
          value={value}
          onChange={onChange}
          hospitals={hospitals.data}
          rangeError={error}
        />
        {error === null && (
          <EventsList q={q} from={filters.from} onOpen={openRow} />
        )}
      </div>
    </>
  );
}
