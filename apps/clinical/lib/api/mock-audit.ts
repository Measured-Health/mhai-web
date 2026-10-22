import type { ActivityEventOut } from "./admin-contract";

// The demo's audit trail for Analysis: memory only, never stored (a reload
// resets it). The admin mock merges it into the activity list.
let events: ActivityEventOut[] = [];
let next = 1;

export function recordAudit(e: Omit<ActivityEventOut, "id">): void {
  events.push({ ...structuredClone(e), id: `au-${next++}` });
}

export function auditEvents(): ActivityEventOut[] {
  return structuredClone(events);
}

export function resetAudit(): void {
  events = [];
  next = 1;
}
