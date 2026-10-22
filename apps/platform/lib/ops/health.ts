// Reads a health reading for the screen. A reading that failed to load, or
// is more than two minutes old, counts as no reading: every block fails and
// the last good time is kept, so old figures are never shown. A block with
// the wrong shape or an enum value the app doesn't know fails on its own.
import {
  ERROR_KINDS,
  PART_KEYS,
  PART_STATUSES,
  STEP_KEYS,
  type ErrorKind,
  type HealthOut,
  type PartKey,
  type PartStatus,
  type StepKey,
  type Timing,
  type TimingBlock,
} from "@/lib/api/ops-contract";
import type { Person } from "@/lib/api/contract";

export const STALE_MS = 120_000;
/** A reading dated further ahead than this is as good as none (clock skew). */
export const SKEW_MS = 300_000;

export type Block<T> = { status: "ok"; value: T } | { status: "failed" };

export type PartsValue = {
  parts: { key: PartKey; status: PartStatus; since: string }[];
  triage: { enabled: boolean };
  cleanUp: {
    last_run_at: string | null;
    ok: boolean | null;
    paused: boolean;
    paused_by: Person | null;
    paused_at: string | null;
  };
};
export type QueueValue = { waiting: number; oldest_wait_s: number | null };
export type FailedJobsValue = { now: number; last_24h: number };
export type TimingValue = { last_hour: TimingBlock; last_24h: TimingBlock };
export type ErrorsValue = {
  kind: ErrorKind;
  last_hour: number;
  last_24h: number;
}[];
export type VersionsValue = { part: PartKey; label: string }[];

export type HealthState = {
  overall: PartStatus | "couldnt_check";
  lastGood: string | null;
  blocks: {
    parts: Block<PartsValue>;
    queue: Block<QueueValue>;
    failedJobs: Block<FailedJobsValue>;
    timing: Block<TimingValue>;
    errors: Block<ErrorsValue>;
    versions: Block<VersionsValue>;
  };
};

const FAILED = { status: "failed" } as const;
const ok = <T>(value: T): Block<T> => ({ status: "ok", value });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;
const isMs = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === "string" && v !== "";
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);
const isTime = (v: unknown): v is string =>
  isStr(v) && !Number.isNaN(Date.parse(v));
const isPerson = (v: unknown): v is Person =>
  isObj(v) && isStr(v.id) && isStr(v.name);

function readTiming(v: unknown): Timing | null {
  return isObj(v) && isMs(v.p50_ms) && isMs(v.p95_ms)
    ? { p50_ms: v.p50_ms, p95_ms: v.p95_ms }
    : null;
}
function readTimingBlock(v: unknown): TimingBlock | null {
  if (!isObj(v) || !Array.isArray(v.steps)) return null;
  const overall = readTiming(v.overall);
  if (!overall) return null;
  const steps: TimingBlock["steps"] = [];
  for (const s of v.steps) {
    const t = readTiming(s);
    if (!t || !isObj(s) || !oneOf(STEP_KEYS, s.step)) return null;
    steps.push({ step: s.step as StepKey, ...t });
  }
  return { overall, steps };
}

function readParts(o: Partial<HealthOut>): Block<PartsValue> {
  const { parts, triage, clean_up: c } = o as Record<string, unknown>;
  if (!Array.isArray(parts) || !isObj(triage) || !isObj(c)) return FAILED;
  if (typeof triage.enabled !== "boolean") return FAILED;
  const rows: PartsValue["parts"] = [];
  for (const p of parts) {
    if (
      !isObj(p) ||
      !oneOf(PART_KEYS, p.key) ||
      !oneOf(PART_STATUSES, p.status) ||
      !isTime(p.since)
    )
      return FAILED;
    rows.push({ key: p.key, status: p.status, since: p.since });
  }
  if (
    new Set(rows.map((r) => r.key)).size !== PART_KEYS.length ||
    rows.length !== PART_KEYS.length
  )
    return FAILED;
  if (
    !(c.last_run_at === null || isTime(c.last_run_at)) ||
    !(c.ok === null || typeof c.ok === "boolean") ||
    typeof c.paused !== "boolean" ||
    !(c.paused_by === null || isPerson(c.paused_by)) ||
    !(c.paused_at === null || isTime(c.paused_at))
  )
    return FAILED;
  return ok({
    parts: rows,
    triage: { enabled: triage.enabled },
    cleanUp: {
      last_run_at: c.last_run_at as string | null,
      ok: c.ok as boolean | null,
      paused: c.paused,
      paused_by: c.paused_by as Person | null,
      paused_at: c.paused_at as string | null,
    },
  });
}

function readQueue(v: unknown): Block<QueueValue> {
  if (!isObj(v) || !isCount(v.waiting)) return FAILED;
  if (!(v.oldest_wait_s === null || isCount(v.oldest_wait_s))) return FAILED;
  return ok({ waiting: v.waiting, oldest_wait_s: v.oldest_wait_s });
}
function readFailedJobs(v: unknown): Block<FailedJobsValue> {
  return isObj(v) && isCount(v.now) && isCount(v.last_24h)
    ? ok({ now: v.now, last_24h: v.last_24h })
    : FAILED;
}
function readTimingValue(v: unknown): Block<TimingValue> {
  if (!isObj(v)) return FAILED;
  const last_hour = readTimingBlock(v.last_hour);
  const last_24h = readTimingBlock(v.last_24h);
  return last_hour && last_24h ? ok({ last_hour, last_24h }) : FAILED;
}
function readErrors(v: unknown): Block<ErrorsValue> {
  if (!Array.isArray(v)) return FAILED;
  const rows: ErrorsValue = [];
  for (const e of v) {
    if (
      !isObj(e) ||
      !oneOf(ERROR_KINDS, e.kind) ||
      !isCount(e.last_hour) ||
      !isCount(e.last_24h)
    )
      return FAILED;
    rows.push({ kind: e.kind, last_hour: e.last_hour, last_24h: e.last_24h });
  }
  return ok(rows);
}
function readVersions(v: unknown): Block<VersionsValue> {
  if (!Array.isArray(v)) return FAILED;
  const rows: VersionsValue = [];
  for (const e of v) {
    if (!isObj(e) || !oneOf(PART_KEYS, e.part) || !isStr(e.label))
      return FAILED;
    rows.push({ part: e.part, label: e.label });
  }
  return ok(rows);
}

const NONE: HealthState["blocks"] = {
  parts: FAILED,
  queue: FAILED,
  failedJobs: FAILED,
  timing: FAILED,
  errors: FAILED,
  versions: FAILED,
};

/** What the Health tab shows for `out`, as of `now` (ms since the epoch). */
export function readHealth(
  out: HealthOut | undefined,
  { failed, now }: { failed: boolean; now: number },
): HealthState {
  const updated = out && isObj(out) ? Date.parse(String(out.updated_at)) : NaN;
  const lastGood =
    out && isObj(out) && typeof out.updated_at === "string"
      ? out.updated_at
      : null;
  if (
    !out ||
    failed ||
    Number.isNaN(updated) ||
    now - updated > STALE_MS ||
    updated - now > SKEW_MS
  )
    return { overall: "couldnt_check", lastGood, blocks: NONE };
  const o = out as Partial<HealthOut>;
  return {
    overall: oneOf(PART_STATUSES, o.overall) ? o.overall : "couldnt_check",
    lastGood,
    blocks: {
      parts: readParts(o),
      queue: readQueue(o.queue),
      failedJobs: readFailedJobs(o.failed_jobs),
      timing: readTimingValue(o.timing),
      errors: readErrors(o.errors),
      versions: readVersions(o.versions),
    },
  };
}

const seconds = (ms: number) => {
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) : String(Math.round(s));
};

/** "Half within 2.4 s · 95 in 100 within 12 s" */
export function answerTimeLine(t: Timing): string {
  return `Half within ${seconds(t.p50_ms)} s · 95 in 100 within ${seconds(t.p95_ms)} s`;
}

/** "45 s", "3 min" or "1 h 5 min". */
export function waitLabel(s: number): string {
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** "14:32" today, else "3 Mar 14:32": the viewer's clock. */
export function timeLabel(iso: string, now: number): string {
  const t = new Date(iso);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const today = new Date(now);
  if (t.toDateString() === today.toDateString()) return `${hh}:${mm}`;
  const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  return `${t.getDate()} ${MONTHS[t.getMonth()]} ${hh}:${mm}`;
}
