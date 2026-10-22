// The platform demo's sample operations data: the health reading in each
// mode and the failed jobs. Invented; no patient, clinician, question or
// answer content, and a job never carries a subject or an error message.
import type { Person } from "./contract";
import type {
  ErrorKind,
  HealthOut,
  Job,
  PartKey,
  PartStatus,
  StepKey,
  Timing,
  TimingBlock,
} from "./ops-contract";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

/** What the sample health reading shows (`setDemoHealth` switches it). */
export type HealthMode =
  "normal" | "slow" | "problem" | "stale" | "unavailable";
export const HEALTH_MODES: readonly HealthMode[] = [
  "normal",
  "slow",
  "problem",
  "stale",
  "unavailable",
];
/** A reading older than this is as good as none (the screen's rule too). */
export const STALE_AFTER_MS = 2 * MIN;
/** The `stale` mode's reading is this old. */
export const STALE_AGE_MS = 5 * MIN;

const T = (p50_ms: number, p95_ms: number): Timing => ({ p50_ms, p95_ms });
const block = (
  overall: Timing,
  steps: Record<StepKey, Timing>,
): TimingBlock => ({
  overall,
  steps: (["privacy", "guidelines", "answer", "evidence"] as const).map(
    (step) => ({ step, ...steps[step] }),
  ),
});

const NORMAL_TIMING = {
  last_hour: block(T(2400, 6100), {
    privacy: T(150, 400),
    guidelines: T(600, 1500),
    answer: T(1400, 3600),
    evidence: T(500, 1300),
  }),
  last_24h: block(T(2500, 6400), {
    privacy: T(160, 420),
    guidelines: T(620, 1600),
    answer: T(1450, 3800),
    evidence: T(520, 1400),
  }),
};
const SLOW_TIMING = {
  last_hour: block(T(5200, 13800), {
    privacy: T(180, 500),
    guidelines: T(900, 2600),
    answer: T(3100, 8400),
    evidence: T(1800, 5200),
  }),
  last_24h: block(T(3300, 9100), {
    privacy: T(170, 450),
    guidelines: T(720, 1900),
    answer: T(1900, 5200),
    evidence: T(900, 2800),
  }),
};

const PARTS: readonly PartKey[] = [
  "app",
  "workers",
  "evidence",
  "documents",
  "guidelines",
  "clean_up",
];

/**
 * The health reading for `mode`, taken at `now`. `failedNow` and
 * `failedLast24h` come from the job list, so the two always agree. Never
 * names a hospital or a person (the clean-up is not paused here).
 */
export function buildHealth(
  now: number,
  mode: Exclude<HealthMode, "unavailable">,
  failedNow: number,
  failedLast24h: number,
): HealthOut {
  const status = (key: PartKey): PartStatus => {
    if (mode === "slow" && (key === "workers" || key === "evidence"))
      return "slow";
    if (mode === "problem" && key === "documents") return "problem";
    return "ok";
  };
  const overall: PartStatus =
    mode === "problem" ? "problem" : mode === "slow" ? "slow" : "ok";
  const sinceAgo = (s: PartStatus) => (s === "ok" ? 3 * D : 25 * MIN);
  const errors: Record<ErrorKind, [number, number]> =
    mode === "problem"
      ? {
          timeout: [4, 9],
          unreachable: [0, 1],
          unreadable: [6, 14],
          invalid: [0, 0],
          other: [1, 2],
        }
      : mode === "slow"
        ? {
            timeout: [3, 5],
            unreachable: [0, 0],
            unreadable: [0, 1],
            invalid: [0, 0],
            other: [0, 1],
          }
        : {
            timeout: [0, 2],
            unreachable: [0, 1],
            unreadable: [0, 1],
            invalid: [0, 0],
            other: [0, 1],
          };
  return {
    updated_at: iso(now - (mode === "stale" ? STALE_AGE_MS : 8_000)),
    overall,
    parts: PARTS.map((key) => ({
      key,
      status: status(key),
      since: iso(now - sinceAgo(status(key))),
    })),
    queue:
      mode === "problem"
        ? { waiting: 31, oldest_wait_s: 420 }
        : mode === "slow"
          ? { waiting: 14, oldest_wait_s: 95 }
          : { waiting: 2, oldest_wait_s: 3 },
    failed_jobs: { now: failedNow, last_24h: failedLast24h },
    timing: mode === "slow" || mode === "problem" ? SLOW_TIMING : NORMAL_TIMING,
    errors: (Object.keys(errors) as ErrorKind[]).map((kind) => ({
      kind,
      last_hour: errors[kind][0],
      last_24h: errors[kind][1],
    })),
    versions: PARTS.map((part) => ({ part, label: "2026.10.3" })),
    triage: { enabled: false },
    clean_up: {
      last_run_at: iso(now - 6 * H),
      ok: true,
      paused: false,
      paused_by: null,
      paused_at: null,
    },
  };
}

const TUNDE: Person = { id: "tm_tunde", name: "Tunde Okafor" };
const NGH: Person = { id: "h_northgate", name: "Northgate General Hospital" };
const RCH: Person = {
  id: "h_riverside",
  name: "Riverside Children's Hospital",
};
const EMC: Person = { id: "h_eastbrook", name: "Eastbrook Medical Centre" };

/**
 * The sample jobs: one of every type and every error kind, an old question,
 * two platform jobs, a retried one, a cancelled one (by Tunde) and a
 * document that fails again on retry (`job_doc_unreadable`).
 */
export function seedJobs(now: number): Job[] {
  const job = (
    id: string,
    type: Job["type"],
    hospital: Person | null,
    createdAgo: number,
    failedAgo: number,
    attempts: number,
    kind: ErrorKind,
    over: Partial<Job> = {},
  ): Job => ({
    id,
    type,
    hospital,
    created_at: iso(now - createdAgo),
    failed_at: iso(now - failedAgo),
    attempts,
    kind,
    status: "failed",
    cancelled_by: null,
    cancelled_at: null,
    ...over,
  });
  return [
    job("job_question_old", "run_query", NGH, 2 * D, 20 * H, 3, "timeout"),
    job(
      "job_feedback_1",
      "submit_feedback",
      RCH,
      4 * H,
      3 * H,
      2,
      "unreachable",
    ),
    job(
      "job_correction_1",
      "approve_correction",
      EMC,
      3 * H,
      2 * H,
      1,
      "invalid",
    ),
    job(
      "job_doc_unreadable",
      "ingest_document",
      RCH,
      2 * H,
      90 * MIN,
      1,
      "unreadable",
    ),
    job("job_triage_1", "run_triage", NGH, 80 * MIN, 50 * MIN, 1, "other"),
    job("job_search_1", "kb_search", EMC, 40 * MIN, 25 * MIN, 2, "timeout"),
    job("job_purge_1", "retention_purge", null, 7 * H, 6 * H, 3, "unreachable"),
    job(
      "job_buffer_1",
      "feedback_buffer_reset",
      null,
      5 * H,
      4 * H,
      1,
      "other",
    ),
    job("job_question_done", "run_query", RCH, 30 * H, 26 * H, 2, "timeout", {
      status: "retried",
    }),
    job(
      "job_feedback_off",
      "submit_feedback",
      EMC,
      10 * H,
      9 * H,
      3,
      "unreachable",
      {
        status: "cancelled",
        cancelled_by: TUNDE,
        cancelled_at: iso(now - 8 * H),
      },
    ),
  ];
}
