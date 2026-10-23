// The Clearances queue: its tabs, how long a letter has waited, and who may
// verify it (Plan 11b). Pure rules; the server sends `today`, so nothing
// here does time-zone arithmetic.
import type { Clearance, ClearanceTab } from "@/lib/api/clearances-contract";

export const TABS: { id: ClearanceTab; label: string }[] = [
  { id: "waiting", label: "To verify" },
  { id: "active", label: "Active" },
  { id: "ending_soon", label: "Ending soon" },
  { id: "all", label: "All" },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "Waiting 5 hours" or "Waiting 3 days", counted from `ready_at`. */
export function waitingText(c: Clearance, now: number): string {
  const from = c.ready_at ? Date.parse(c.ready_at) : NaN;
  if (!Number.isFinite(from)) return "Waiting";
  const ms = Math.max(0, now - from);
  if (ms >= DAY) return `Waiting ${plural(Math.floor(ms / DAY), "day")}`;
  if (ms >= HOUR) return `Waiting ${plural(Math.floor(ms / HOUR), "hour")}`;
  return "Waiting less than an hour";
}

export type VerifyBlock =
  "auditor" | "covers_you" | "same_side" | "not_ready" | "done";

/**
 * Why the caller can't verify or reject a letter, or null when they can.
 * Checked in this order: an auditor never changes anything; a letter that
 * covers you can't be verified by you (this comes before `same_side`); a
 * linked admin can't verify the hospital's letters; a letter still being
 * checked isn't ready; anything else that isn't waiting is done.
 */
export function verifyBlock(
  c: Clearance,
  isAdmin: boolean,
): VerifyBlock | null {
  if (!isAdmin) return "auditor";
  if (c.covers_you) return "covers_you";
  if (!c.verifiable_by_you) return "same_side";
  if (c.status === "checking") return "not_ready";
  if (c.status !== "waiting") return "done";
  return null;
}
