// The one place the record connection codes become words. A sync problem
// this app doesn't know reads the fallback, never the code or server text.
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CirclePause,
  type LucideIcon,
} from "lucide-react";
import type {
  ConnectionState,
  EmrConnectionSummary,
  SyncErrorCode,
} from "@/lib/api/emr-contract";
import { num } from "@/lib/format";

const STATE_WORDS: Record<ConnectionState, string> = {
  not_tested: "Not tested",
  connected: "Connected",
  needs_attention: "Needs attention",
  off: "Switched off",
};
/** Each state is a word and an icon, never colour alone. */
export const STATE_ICON: Record<ConnectionState, LucideIcon> = {
  connected: CheckCircle2,
  needs_attention: CircleAlert,
  off: CirclePause,
  not_tested: CircleDashed,
};
export const stateLabel = (s: ConnectionState) => STATE_WORDS[s];

const SYNC_ERROR_WORDS: Record<SyncErrorCode, string> = {
  unreachable: "Couldn't reach the record system",
  sign_in_refused:
    "The record system refused the sign-in. Check the credentials.",
  timed_out: "The record system took too long to answer",
  unreadable_data: "Some records couldn't be read",
  unmapped_codes: "Some results use codes MHAI doesn't know yet",
  too_many_requests: "The record system asked MHAI to slow down",
};
export const UNKNOWN_SYNC_ERROR = "Something went wrong with this connection.";

/** A sync problem in words; an unknown code reads the fallback. */
export const syncErrorLabel = (code: string): string =>
  Object.hasOwn(SYNC_ERROR_WORDS, code)
    ? SYNC_ERROR_WORDS[code as SyncErrorCode]
    : UNKNOWN_SYNC_ERROR;

/** "2 min ago", "6 h ago", "5 d ago"; null for an unreadable time. */
export function agoLabel(at: string, now: number): string | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

/** "Last update 2 min ago · 1,284 records", or "No updates yet". */
export function syncLine(c: EmrConnectionSummary, now: number): string {
  const s = c.last_sync;
  const when = s ? agoLabel(s.at, now) : null;
  if (!s || when === null) return "No updates yet";
  const records = `${num(s.records)} ${s.records === 1 ? "record" : "records"}`;
  return `Last update ${when} · ${records}`;
}
