// Platform settings as the platform client sees them (spec §9, Plan 8c):
// how long records are kept, triage, and the learning-data buffer. Counts
// and opaque ids only. Every change asks for a reason and step-up (except
// cancelling a request) and sends the `version` the person saw; a clash is
// 409 `conflict`. Every write returns the whole `SettingsOut`.
import type { Person, StepUp, TwoPersonRequest, WriteOpts } from "./contract";

export type RetentionType =
  "records" | "documents" | "pending_corrections" | "audit_log";
export const RETENTION_TYPES: readonly RetentionType[] = [
  "records",
  "documents",
  "pending_corrections",
  "audit_log",
];

export type NotReadyReason =
  "missing_report" | "missing_files" | "checksum_mismatch";
export const NOT_READY_REASONS: readonly NotReadyReason[] = [
  "missing_report",
  "missing_files",
  "checksum_mismatch",
];

/** A change request lapses this many days after it was made. */
export const SETTING_LAPSE_DAYS = 7;
/** The reset runs for this long in the demo before it finishes. */
export const RESET_MS = 3_000;

export type RetentionItem = {
  type: RetentionType;
  days: number;
  minimum_days: number;
  last_run: {
    at: string;
    ok: boolean;
    deleted: number;
    kept_for_holds: number;
  } | null;
  next_run_at: string | null;
  changed_by: Person | null;
  changed_at: string | null;
  version: number;
};

/**
 * A shorter retention period, or triage switched on: each needs a different
 * platform admin's approval. `version` is the setting's current version, which
 * approving or cancelling sends (it acts only on the request the person saw).
 */
export type SettingsRequest = TwoPersonRequest & { version: number } & (
    | {
        kind: "retention_shorten";
        type: RetentionType;
        from: number;
        to: number;
      }
    | { kind: "triage_on"; from: false; to: true; clinical_signoff: string }
  );

export type SettingsOut = {
  retention: {
    /** False while the periods are placeholders awaiting compliance. */
    confirmed: boolean;
    paused: boolean;
    paused_by: Person | null;
    paused_at: string | null;
    /** The pause's own version; pause and resume send the one they saw. */
    version: number;
    items: RetentionItem[];
  };
  triage: {
    enabled: boolean;
    ready: boolean;
    not_ready_reason: NotReadyReason | null;
    changed_by: Person | null;
    changed_at: string | null;
    version: number;
  };
  feedback_buffer: {
    waiting: number;
    last_reset: {
      by: Person;
      at: string;
      reason: string;
      cleared: number;
    } | null;
    running: { job_id: string; started_at: string } | null;
    failed_job_id: string | null;
  };
  pending: SettingsRequest[];
};

export interface SettingsClient {
  getSettings(): Promise<SettingsOut>;
  /** How many records a shorter period would delete at the next clean-up. */
  previewRetention(
    type: RetentionType,
    days: number,
  ): Promise<{ would_delete: number }>;
  /**
   * Longer applies at once; shorter makes a pending request (202). 409
   * `conflict` on a stale version; 422 `below_minimum`.
   */
  setRetention(
    type: RetentionType,
    body: { days: number; reason: string; version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<SettingsOut>;
  /** 409 `conflict` when `version` isn't the pause's, or it is already so. */
  setCleanUpPaused(
    body: { paused: boolean; reason: string; version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<SettingsOut>;
  /**
   * Off applies at once. On needs `ready` (409 `not_ready`) and a clinical
   * sign-off, and makes a pending request.
   */
  setTriage(
    body: {
      enabled: boolean;
      reason: string;
      clinical_signoff?: string;
      version: number;
    } & StepUp,
    opts: WriteOpts,
  ): Promise<SettingsOut>;
  /**
   * A different admin only (409 `same_person`); 409 `expired` after the lapse
   * and `not_ready` if triage is no longer ready; 409 `conflict` when
   * `version` isn't the setting's.
   */
  approveRequest(
    id: string,
    body: { version: number } & StepUp,
    opts: WriteOpts,
  ): Promise<SettingsOut>;
  /** Either admin; no step-up. */
  cancelRequest(
    id: string,
    body: { version: number },
    opts: WriteOpts,
  ): Promise<SettingsOut>;
  /** Starts the reset; the buffer's `running` says when it is done. */
  resetFeedbackBuffer(
    body: { reason: string } & StepUp,
    opts: WriteOpts,
  ): Promise<{ job_id: string }>;
}
