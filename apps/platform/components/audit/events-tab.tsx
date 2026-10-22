"use client";
import { useNow } from "@mhai/ui/hooks/use-now";
import { useAuditEvents, useAuditHospitals } from "@/lib/queries/audit";
import { EventFilters, filtersOf, type EventsState } from "./event-filters";
import { EventsList } from "./events-list";

/**
 * Events: the filters, then the list for them. A new filter set replaces
 * the list; dates that can't be used are refused before anything is sent.
 */
export function EventsTab({
  value,
  onChange,
  onOpen,
}: {
  value: EventsState;
  onChange(next: EventsState): void;
  onOpen?: (id: string) => void;
}) {
  const now = useNow();
  const hospitals = useAuditHospitals();
  const built = filtersOf(value, now);
  const error = "error" in built ? built.error : null;
  const filters = "filters" in built ? built.filters : {};
  const q = useAuditEvents(filters, error === null);

  return (
    <div className="flex flex-col gap-5">
      <EventFilters
        value={value}
        onChange={onChange}
        hospitals={hospitals.data}
        rangeError={error}
      />
      {error === null && (
        <EventsList q={q} from={filters.from} onOpen={onOpen} />
      )}
    </div>
  );
}
