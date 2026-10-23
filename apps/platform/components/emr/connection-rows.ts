import type { EmrConnectionSummary } from "@/lib/api/emr-contract";
import type { Person } from "@/lib/api/contract";
import { connectionState } from "@/lib/emr/state";

export type ConnectionFilter =
  "all" | "needs_attention" | "off" | "not_connected";
export const CONNECTION_FILTERS: readonly ConnectionFilter[] = [
  "all",
  "needs_attention",
  "off",
  "not_connected",
];
export const FILTER_WORDS: Record<ConnectionFilter, string> = {
  all: "All",
  needs_attention: "Needs attention",
  off: "Switched off",
  not_connected: "Not connected",
};
export const FILTER_EMPTY: Record<ConnectionFilter, string> = {
  all: "No connections yet",
  needs_attention: "Nothing needs attention.",
  off: "No connections are switched off.",
  not_connected: "Every hospital has a connection.",
};

/** A row is a connection, or a hospital that has none. */
export type ConnectionRow =
  | { kind: "connection"; c: EmrConnectionSummary }
  | { kind: "none"; hospital: Person };

export const asFilter = (v: string | null): ConnectionFilter =>
  CONNECTION_FILTERS.find((f) => f === v) ?? "all";

/** The rows for a filter. "Switched off" includes ones never tested. */
export function rowsFor(
  f: ConnectionFilter,
  connections: EmrConnectionSummary[],
  notConnected: Person[],
): ConnectionRow[] {
  const keep = (c: EmrConnectionSummary) => {
    const s = connectionState(c);
    return f === "needs_attention"
      ? s === "needs_attention"
      : f === "off"
        ? s === "off" || s === "not_tested"
        : f === "all";
  };
  const own: ConnectionRow[] = connections
    .filter(keep)
    .map((c) => ({ kind: "connection", c }));
  const none: ConnectionRow[] =
    f === "all" || f === "not_connected"
      ? notConnected.map((hospital) => ({ kind: "none", hospital }))
      : [];
  return [...own, ...none];
}

export const countFor = (
  f: ConnectionFilter,
  connections: EmrConnectionSummary[],
  notConnected: Person[],
) => rowsFor(f, connections, notConnected).length;

/** "2 min ago · 1,284 records", or "No updates yet". */
export const lastUpdate = (line: string) => line.replace(/^Last update /, "");
