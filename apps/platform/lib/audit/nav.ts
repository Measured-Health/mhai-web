// The in-memory hand-off to a tab of the audit log, for the bell and the
// banner: nothing goes in the URL or in browser storage. Read once.
import type { NamedAccessFilters } from "@/lib/api/audit-contract";

export type AuditTab = "events" | "named" | "exports" | "integrity";
type Handoff = { tab: AuditTab; named?: NamedAccessFilters };

let pending: Handoff | null = null;

/** Asks the audit view to open at `tab` next time it mounts. */
export function openAuditAt(tab: AuditTab, named?: NamedAccessFilters): void {
  pending = named ? { tab, named } : { tab };
}

/** The tab handed off, once; null after that. */
export function takeAuditTab(): Handoff | null {
  const h = pending;
  pending = null;
  return h;
}
