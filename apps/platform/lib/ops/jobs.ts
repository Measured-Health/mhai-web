import {
  ERROR_KINDS,
  JOB_STATUSES,
  JOB_TYPES,
  OLD_QUESTION_MS,
  type Job,
} from "@/lib/api/ops-contract";
import { dateLabel } from "@/lib/format";

/** How many chosen questions were first tried more than a day ago. */
export function oldQuestions(jobs: Job[], now: number): number {
  return jobs.filter(
    (j) =>
      j.type === "run_query" &&
      now - Date.parse(j.created_at) > OLD_QUESTION_MS,
  ).length;
}

const EFFECTS: [Job["type"] | null, string][] = [
  [
    "run_query",
    "The clinician will see 'Couldn't complete' and can ask again.",
  ],
  [
    "ingest_document",
    "The document won't be read; the clinician can upload it again.",
  ],
  [
    "approve_correction",
    "The correction stays waiting and can be approved again.",
  ],
  [
    "retention_purge",
    "The records clean-up runs again tomorrow. Nothing is deleted.",
  ],
  [null, "The work won't be done. Nothing is deleted."],
];

/** What cancelling does, one line per kind of work chosen, in a set order. */
export function cancelEffects(jobs: Job[]): string[] {
  const named = EFFECTS.filter(([t]) => t !== null).map(([t]) => t);
  const has = (t: Job["type"] | null) =>
    t === null
      ? jobs.some((j) => !named.includes(j.type))
      : jobs.some((j) => j.type === t);
  return EFFECTS.filter(([t]) => has(t)).map(([, line]) => line);
}

/** "1 job" or "3 jobs". */
export const jobsCount = (n: number) => `${n} ${n === 1 ? "job" : "jobs"}`;

/** "Retried 3 jobs", plus how many had already moved on. */
export function resultLine(
  done: number,
  skipped: number,
  verb: "Retried" | "Cancelled",
): string {
  const base = `${verb} ${jobsCount(done)}`;
  return skipped > 0
    ? `${base} · ${skipped} ${skipped === 1 ? "was" : "were"} already retried or finished`
    : base;
}

/** A job whose enum values the app knows; anything else fails the list. */
export const isKnownJob = (j: Job): boolean =>
  JOB_TYPES.includes(j.type) &&
  JOB_STATUSES.includes(j.status) &&
  ERROR_KINDS.includes(j.kind);

/** The status cell's words: "Cancelled by Ada Bakare · 21 Oct 2026". */
export function statusLine(j: Job, label: string): string {
  if (j.status === "cancelled" && j.cancelled_by)
    return `${label} by ${j.cancelled_by.name}${
      j.cancelled_at ? ` · ${dateLabel(j.cancelled_at)}` : ""
    }`;
  return label;
}
