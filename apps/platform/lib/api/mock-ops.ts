import { ApiError } from "@mhai/api-client/errors";
import type { MockCore } from "./mock";
import {
  CANCEL_REASONS,
  ERROR_KINDS,
  JOB_STATUSES,
  JOB_TYPES,
  JOBS_MAX,
  type CancelReason,
  type Job,
  type JobStatus,
  type JobQuery,
  type OpsClient,
} from "./ops-contract";
import {
  buildHealth,
  HEALTH_MODES,
  seedJobs,
  type HealthMode,
} from "./ops-fixtures";

const PAGE = 50;
const NOTE_MAX = 500;
const DAY_MS = 24 * 60 * 60_000;

const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const iso = (ms: number) => new Date(ms).toISOString();

const CANCEL_WORDS: Record<CancelReason, string> = {
  no_longer_needed: "No longer needed",
  cant_succeed: "Can't succeed",
  other: "Other",
};

/** The most recent demo's way to change its health mode (see below). */
let setActiveMode: ((mode: HealthMode) => void) | null = null;
/**
 * Switches the running demo's sample health reading (the Health tab's
 * "Sample data" control, shown only for the demo).
 */
export function setDemoHealth(mode: HealthMode) {
  if (!HEALTH_MODES.includes(mode)) return;
  setActiveMode?.(mode);
}

/** A list of 1 to JOBS_MAX distinct text ids, else 422. */
function idsOf(v: unknown): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > JOBS_MAX)
    return invalid();
  if (v.some((x) => typeof x !== "string" || x === "")) return invalid();
  return [...new Set(v as string[])];
}

const count = (n: number) => `${n} failed job${n === 1 ? "" : "s"}`;

/**
 * System health and failed jobs for the demo, on the same core as the
 * hospitals part. Memory only; a reload resets it.
 */
export function createMockOps(
  core: MockCore,
  { health = "normal" }: { health?: HealthMode } = {},
): OpsClient {
  let mode = HEALTH_MODES.includes(health) ? health : "normal";
  setActiveMode = (m) => void (mode = m);
  const jobs: Job[] = seedJobs(core.now());

  const failedNow = () => jobs.filter((j) => j.status === "failed").length;
  const failedLast24h = () =>
    jobs.filter((j) => core.now() - Date.parse(j.failed_at) <= DAY_MS).length;

  const filter = <T extends string>(
    v: unknown,
    allowed: readonly T[],
  ): T | undefined => {
    if (v === undefined || v === "") return undefined;
    return allowed.includes(v as T) ? (v as T) : invalid();
  };

  return {
    getHealth: () =>
      core.read(() => {
        const now = mode;
        if (now === "unavailable") return fail(503, "unavailable");
        return buildHealth(core.now(), now, failedNow(), failedLast24h());
      }),

    listJobs: (q: JobQuery) =>
      core.read(() => {
        const status =
          filter<JobStatus | "all">(q.status, [...JOB_STATUSES, "all"]) ??
          "failed";
        const type = filter(q.type, JOB_TYPES);
        const kind = filter(q.kind, ERROR_KINDS);
        const hospital = q.hospital || undefined;
        const rows = jobs
          .filter((j) => status === "all" || j.status === status)
          .filter((j) => !type || j.type === type)
          .filter((j) => !kind || j.kind === kind)
          .filter((j) => !hospital || j.hospital?.id === hospital)
          .sort((a, b) => Date.parse(b.failed_at) - Date.parse(a.failed_at));
        const start = Math.max(0, Number(q.cursor) || 0);
        const end = start + PAGE;
        return {
          jobs: rows.slice(start, end),
          next_cursor: end < rows.length ? String(end) : null,
        };
      }),

    retryJobs: (body, opts) =>
      core.write(opts, (m) => {
        const ids = idsOf(body?.ids);
        const retried: string[] = [];
        const skipped: string[] = [];
        for (const id of ids) {
          const j = jobs.find((x) => x.id === id);
          if (!j || j.status !== "failed") {
            skipped.push(id);
            continue;
          }
          retried.push(id);
          if (j.kind === "unreadable") {
            // The document can't be read: it fails again, one attempt later.
            j.attempts++;
            j.failed_at = iso(core.now());
          } else j.status = "retried";
        }
        if (retried.length > 0)
          core.log({ id: m.id, name: m.name }, "jobs_retried", {
            target: count(retried.length),
          });
        return { retried, skipped };
      }),

    cancelJobs: (body, opts) =>
      core.write(opts, async (m) => {
        const ids = idsOf(body?.ids);
        const reason = CANCEL_REASONS.find((r) => r === body.reason);
        if (!reason) return invalid();
        const raw: unknown = body.note;
        if (raw !== undefined && typeof raw !== "string") invalid();
        const trimmed = (raw as string | undefined)?.trim() ?? "";
        if (trimmed.length > NOTE_MAX) invalid();
        const note = trimmed === "" ? null : trimmed;
        if (reason === "other" && note === null) invalid();
        await core.checkCode(m, body);
        const cancelled: string[] = [];
        const skipped: string[] = [];
        for (const id of ids) {
          const j = jobs.find((x) => x.id === id);
          if (!j || j.status !== "failed") {
            skipped.push(id);
            continue;
          }
          j.status = "cancelled";
          j.cancelled_by = { id: m.id, name: m.name };
          j.cancelled_at = iso(core.now());
          cancelled.push(id);
        }
        if (cancelled.length > 0)
          // The reason in words; the note stays out of Activity.
          core.log({ id: m.id, name: m.name }, "jobs_cancelled", {
            target: count(cancelled.length),
            detail: CANCEL_WORDS[reason],
          });
        return { cancelled, skipped };
      }),
  };
}
