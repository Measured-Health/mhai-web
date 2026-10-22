// Notifications and the analytics email preference (spec §7, backend §14.7).
// A notification is an analytics change from What changed, as one person
// sees it: counts only, in the same words as the change itself.
import type { Direction, Guarded, MeasureId } from "./analytics-contract";
import type { Person } from "./contract";

/** At most this many notifications come back, newest first. */
export const NOTIFICATIONS_MAX = 20;

export type Notification = {
  id: string;
  /** The analytics change it is about. */
  change_id: string;
  /** Null for a change across all hospitals. */
  hospital: Person | null;
  /** The change's own words, from the server. */
  summary: string;
  /** Critical-type: Critical handling or unhandled Critical alerts. */
  serious: boolean;
  direction: Direction;
  /** As on the change: what it measures, and both sides, hidden when 1–4. */
  measure: MeasureId;
  previous: Guarded;
  current: Guarded;
  /** When the change was first flagged. */
  at: string;
  /** Whether the signed-in person has seen it (per person, set by the server). */
  seen: boolean;
};

/**
 * `unseen` is the count of ALL of this person's unseen notifications, which
 * can be more than the (at most 20) `items` returned.
 */
export type NotificationsOut = { items: Notification[]; unseen: number };

/** Which analytics emails a platform admin gets; auditors get none. */
export type EmailMode = "off" | "critical" | "critical_and_digest";
export const EMAIL_MODES: readonly EmailMode[] = [
  "off",
  "critical",
  "critical_and_digest",
];
export type EmailPref = { mode: EmailMode; version: number };
