// The platform demo's sample settings. Placeholders: the periods are not
// confirmed. Invented figures; no patient, clinician, question or answer
// content.
import type { Person } from "./contract";
import { nextCleanUp } from "./holds-fixtures";
import type {
  NotReadyReason,
  RetentionItem,
  RetentionType,
  SettingsOut,
} from "./settings-contract";

const D = 24 * 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };

/** What the sample triage reading says (`opts.triage`). */
export type TriageMode = "ready" | "not_ready";

/** The days kept and the least the server allows, per type. */
export const RETENTION_DEFAULTS: Readonly<
  Record<RetentionType, { days: number; minimum_days: number }>
> = {
  records: { days: 2190, minimum_days: 365 },
  documents: { days: 2190, minimum_days: 365 },
  pending_corrections: { days: 365, minimum_days: 30 },
  audit_log: { days: 2190, minimum_days: 2190 },
};
/** The records a year's shortening would delete, for the preview. */
export const PREVIEW_PER_YEAR = 4100;
export const NOT_READY_SAMPLE: NotReadyReason = "missing_report";

/** The same words the server uses in Activity (the app's own are in lib/settings/labels.ts). */
export const RETENTION_WORDS: Record<RetentionType, string> = {
  records: "Records",
  documents: "Documents",
  pending_corrections: "Pending corrections",
  audit_log: "Audit log",
};

/** "3 years", "6 months" or "45 days". */
export function daysWords(days: number): string {
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (days % 365 === 0) return n(days / 365, "year");
  if (days % 30 === 0) return n(days / 30, "month");
  return n(days, "day");
}

/** The clean-up runs at 02:00 Lagos (01:00 UTC), as holds' dates say. */
export function seedRetention(now: number): RetentionItem[] {
  const next = nextCleanUp(now);
  const last = iso(Date.parse(next) - D);
  return (Object.keys(RETENTION_DEFAULTS) as RetentionType[]).map((type) => ({
    type,
    ...RETENTION_DEFAULTS[type],
    last_run: {
      at: last,
      ok: true,
      deleted: 312,
      kept_for_holds: 1840,
    },
    next_run_at: next,
    changed_by: null,
    changed_at: null,
    version: 1,
  }));
}

export function seedFeedbackBuffer(
  now: number,
): SettingsOut["feedback_buffer"] {
  return {
    waiting: 37,
    last_reset: {
      by: TUNDE,
      at: iso(now - 60 * D),
      reason: "Test run data from a training session",
      cleared: 112,
    },
    running: null,
    failed_job_id: null,
  };
}

/**
 * What the settings area shares with the health reading, through
 * `MockCore.shared` (the key is the name here).
 */
export const SHARED_CLEAN_UP = "clean_up";
export const SHARED_TRIAGE = "triage";
export type SharedCleanUp = {
  paused: boolean;
  paused_by: Person | null;
  paused_at: string | null;
};
export type SharedTriage = { enabled: boolean };
