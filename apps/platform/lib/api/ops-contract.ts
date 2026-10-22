// The operations API (system health and failed jobs) as the platform client
// sees it (spec §9). Counts and opaque ids only: no hospital or person is
// named in the health reading, and a job never carries its subject, user or
// error message. Every id matches /^[A-Za-z0-9_-]+$/.
import type { Person, StepUp, WriteOpts } from "./contract";

export type PartStatus = "ok" | "slow" | "problem";
export type PartKey =
  "app" | "workers" | "evidence" | "documents" | "guidelines" | "clean_up";
export type StepKey = "privacy" | "guidelines" | "answer" | "evidence";
export type ErrorKind =
  "timeout" | "unreachable" | "unreadable" | "invalid" | "other";
export type Timing = { p50_ms: number; p95_ms: number };
export type TimingBlock = {
  overall: Timing;
  steps: ({ step: StepKey } & Timing)[];
};
export type HealthOut = {
  updated_at: string;
  overall: PartStatus;
  parts: { key: PartKey; status: PartStatus; since: string }[];
  queue: { waiting: number; oldest_wait_s: number | null };
  failed_jobs: { now: number; last_24h: number };
  timing: { last_hour: TimingBlock; last_24h: TimingBlock };
  errors: { kind: ErrorKind; last_hour: number; last_24h: number }[];
  versions: { part: PartKey; label: string }[];
  triage: { enabled: boolean };
  clean_up: {
    last_run_at: string | null;
    ok: boolean | null;
    paused: boolean;
    paused_by: Person | null;
    paused_at: string | null;
  };
};

export type JobType =
  | "run_query"
  | "submit_feedback"
  | "approve_correction"
  | "ingest_document"
  | "run_triage"
  | "kb_search"
  | "feedback_buffer_reset"
  | "retention_purge";
export type JobStatus = "failed" | "retrying" | "retried" | "cancelled";
export type Job = {
  id: string;
  type: JobType;
  /** The hospital it ran for; null for a platform job. */
  hospital: Person | null;
  created_at: string;
  failed_at: string;
  attempts: number;
  kind: ErrorKind;
  status: JobStatus;
  cancelled_by: Person | null;
  cancelled_at: string | null;
};
export type JobQuery = {
  /** Failed when not given. */
  status?: JobStatus | "all";
  type?: JobType;
  hospital?: string;
  kind?: ErrorKind;
  cursor?: string;
};
export type CancelReason = "no_longer_needed" | "cant_succeed" | "other";

export const PART_STATUSES: readonly PartStatus[] = ["ok", "slow", "problem"];
export const PART_KEYS: readonly PartKey[] = [
  "app",
  "workers",
  "evidence",
  "documents",
  "guidelines",
  "clean_up",
];
export const STEP_KEYS: readonly StepKey[] = [
  "privacy",
  "guidelines",
  "answer",
  "evidence",
];
export const ERROR_KINDS: readonly ErrorKind[] = [
  "timeout",
  "unreachable",
  "unreadable",
  "invalid",
  "other",
];
export const JOB_TYPES: readonly JobType[] = [
  "run_query",
  "submit_feedback",
  "approve_correction",
  "ingest_document",
  "run_triage",
  "kb_search",
  "feedback_buffer_reset",
  "retention_purge",
];
export const JOB_STATUSES: readonly JobStatus[] = [
  "failed",
  "retrying",
  "retried",
  "cancelled",
];
export const CANCEL_REASONS: readonly CancelReason[] = [
  "no_longer_needed",
  "cant_succeed",
  "other",
];

/** Retry or cancel at most this many jobs at once. */
export const JOBS_MAX = 50;
/** A question first tried longer ago than this is an "old question". */
export const OLD_QUESTION_MS = 24 * 60 * 60_000;

export interface OpsClient {
  /**
   * `background: true` marks the poll, so the proxy doesn't count it as
   * activity. 503 when the reading can't be had.
   */
  getHealth(opts?: { background?: boolean }): Promise<HealthOut>;
  /** Newest failure first; failed jobs unless `status` says otherwise. */
  listJobs(q: JobQuery): Promise<{ jobs: Job[]; next_cursor: string | null }>;
  /**
   * No step-up. `retried` means attempted: a job can still be `failed`
   * afterwards (an unreadable document), so don't assume it left the failed
   * list. Jobs that are no longer failed come back in `skipped`.
   */
  retryJobs(
    body: { ids: string[] },
    opts: WriteOpts,
  ): Promise<{ retried: string[]; skipped: string[] }>;
  /** Needs step-up. `other` needs a note. */
  cancelJobs(
    body: { ids: string[]; reason: CancelReason; note?: string } & StepUp,
    opts: WriteOpts,
  ): Promise<{ cancelled: string[]; skipped: string[] }>;
}
