// The demo's platform settings (Plan 8c), built on the mock core. Memory
// only. It refuses what the backend refuses (spec §9), with the same codes.
import { ApiError } from "@mhai/api-client/errors";
import type { Person, TeamMember, TwoPersonRequest } from "./contract";
import type { MockCore } from "./mock";
import type { Job } from "./ops-contract";
import {
  RESET_MS,
  RETENTION_TYPES,
  SETTING_LAPSE_DAYS,
  type RetentionItem,
  type RetentionType,
  type SettingsClient,
  type SettingsOut,
  type SettingsRequest,
} from "./settings-contract";
import {
  NOT_READY_SAMPLE,
  PREVIEW_PER_YEAR,
  RETENTION_WORDS,
  SHARED_CLEAN_UP,
  SHARED_JOB_SOURCE,
  SHARED_TRIAGE,
  daysWords,
  seedFeedbackBuffer,
  seedRetention,
  type SharedCleanUp,
  type SharedJobSource,
  type SharedTriage,
  type TriageMode,
} from "./settings-fixtures";

const D = 24 * 3_600_000;
const REASON_MAX = 500;
const SIGNOFF_MAX = 200;

const iso = (ms: number) => new Date(ms).toISOString();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });

/** Trimmed text of 1 to `max` characters, else 422. */
function text(v: unknown, max: number): string {
  if (typeof v !== "string") return invalid();
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : invalid();
}
/** The version the person saw, which every change sends; else 422. */
function versionOf(body: unknown): number {
  const v = (body as { version?: unknown } | null)?.version;
  return typeof v === "number" ? v : invalid();
}
const typeOf = (t: unknown): RetentionType =>
  RETENTION_TYPES.find((x) => x === t) ?? fail(404, "not_found");
const wholeDays = (v: unknown): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : invalid();

export type SettingsMockOptions = {
  /**
   * Whether triage can be switched on. A function is asked each time, so a
   * test can lose readiness between a request and its approval.
   */
  triage?: TriageMode | (() => TriageMode);
  /** The learning-data reset fails: `failed_job_id` is set when it ends. */
  resetFails?: boolean | (() => boolean);
};

export function settingsMock(
  core: MockCore,
  {
    triage: triageMode = "ready",
    resetFails = false,
  }: SettingsMockOptions = {},
): SettingsClient {
  const { now, log } = core;
  const items: RetentionItem[] = seedRetention(now());
  const cleanUp: SharedCleanUp = {
    paused: false,
    paused_by: null,
    paused_at: null,
  };
  /** Bumped by every pause and resume. */
  let pauseVersion = 1;
  const triage = {
    enabled: false,
    changed_by: null as Person | null,
    changed_at: null as string | null,
    version: 1,
  };
  const buffer = seedFeedbackBuffer(now());
  let resetBy: Person | null = null;
  let resetReason = "";
  /** Whether the reset now running will fail (asked when it starts). */
  let runFails = false;
  /** The failed jobs failed resets leave in System's list, oldest first. */
  const failedJobs: Job[] = [];
  let pending: SettingsRequest[] = [];
  /** Requests that lapsed, so a late approval says `expired`, not 404. */
  const lapsed = new Set<string>();
  /** Requests approved, cancelled or superseded: a late act is a clash. */
  const decided = new Set<string>();

  // The health reading follows these.
  core.shared[SHARED_CLEAN_UP] = cleanUp;
  const sharedTriage: SharedTriage = { enabled: false };
  core.shared[SHARED_TRIAGE] = sharedTriage;
  // System's jobs list adds a failed reset's job (once) when it looks.
  const jobSource: SharedJobSource = {
    sync(jobs) {
      settle();
      for (const f of failedJobs)
        if (!jobs.some((j) => j.id === f.id)) jobs.push(f);
    },
  };
  core.shared[SHARED_JOB_SOURCE] = jobSource;

  const ready = () =>
    (typeof triageMode === "function" ? triageMode() : triageMode) === "ready";
  const item = (type: RetentionType) =>
    items.find((i) => i.type === type) ?? fail(404, "not_found");
  /** The version of the setting a request is about. */
  const settingVersion = (r: SettingsRequest) =>
    r.kind === "triage_on" ? triage.version : item(r.type).version;
  const bump = (r: SettingsRequest) => {
    if (r.kind === "triage_on") triage.version++;
    else item(r.type).version++;
  };
  /** The change in the server's words, for Activity. */
  const words = (r: SettingsRequest) =>
    r.kind === "triage_on"
      ? "Switch triage on"
      : `Shorten ${RETENTION_WORDS[r.type]} to ${daysWords(r.to)}`;

  /** Time-driven changes: requests lapse, the reset finishes. */
  function settle() {
    const t = now();
    for (const r of pending.filter((x) => t >= Date.parse(x.expires_at))) {
      pending = pending.filter((x) => x !== r);
      lapsed.add(r.id);
      bump(r);
      log(r.requested_by, "setting_change_lapsed", { target: words(r) });
    }
    const run = buffer.running;
    if (run && t >= Date.parse(run.started_at) + RESET_MS) {
      buffer.running = null;
      if (runFails) {
        buffer.failed_job_id = run.job_id;
        const failedAt = iso(Date.parse(run.started_at) + RESET_MS);
        failedJobs.push({
          id: run.job_id,
          type: "feedback_buffer_reset",
          hospital: null,
          created_at: run.started_at,
          failed_at: failedAt,
          attempts: 1,
          kind: "other",
          status: "failed",
          cancelled_by: null,
          cancelled_at: null,
        });
      } else if (resetBy) {
        buffer.last_reset = {
          by: resetBy,
          at: iso(Date.parse(run.started_at) + RESET_MS),
          reason: resetReason,
          cleared: buffer.waiting,
        };
        log(resetBy, "feedback_buffer_cleared", {
          target: `${buffer.waiting} items`,
        });
        buffer.waiting = 0;
      }
    }
  }

  function out(): SettingsOut {
    settle();
    // Once System has retried or cancelled the failed job, it isn't failed.
    const f = failedJobs.find((j) => j.id === buffer.failed_job_id);
    if (f && f.status !== "failed") buffer.failed_job_id = null;
    return {
      retention: {
        confirmed: false,
        paused: cleanUp.paused,
        paused_by: cleanUp.paused_by,
        paused_at: cleanUp.paused_at,
        version: pauseVersion,
        items,
      },
      triage: {
        ...triage,
        ready: ready(),
        not_ready_reason: ready() ? null : NOT_READY_SAMPLE,
      },
      feedback_buffer: buffer,
      pending: pending.map((r) => ({ ...r, version: settingVersion(r) })),
    };
  }

  /** A new two-person request (the requester's `requested_by_you` is set per caller). */
  const request = (
    m: TeamMember,
    reason: string,
  ): Omit<TwoPersonRequest, "kind"> & { version: number } => ({
    id: core.newId("req"),
    requested_by: person(m),
    requested_at: iso(now()),
    reason,
    requested_by_you: true,
    expires_at: iso(now() + SETTING_LAPSE_DAYS * D),
    version: 0,
  });

  return {
    getSettings: () => core.read(out),

    previewRetention: (type, days) =>
      core.read(() => {
        const cur = item(typeOf(type)).days;
        const to = wholeDays(days);
        return {
          would_delete:
            to >= cur ? 0 : Math.round(((cur - to) / 365) * PREVIEW_PER_YEAR),
        };
      }),

    setRetention: (type, body, opts) =>
      core.write(opts, async (m) => {
        settle();
        const it = item(typeOf(type));
        const b = (body ?? {}) as Record<string, unknown>;
        const days = wholeDays(b.days);
        const reason = text(b.reason, REASON_MAX);
        const version = versionOf(b);
        if (version !== it.version) fail(409, "conflict");
        if (days < it.minimum_days) fail(422, "below_minimum");
        if (days === it.days) invalid();
        const shorter = days < it.days;
        if (
          shorter &&
          pending.some(
            (r) => r.kind === "retention_shorten" && r.type === it.type,
          )
        )
          fail(409, "conflict");
        await core.checkCode(m, body);
        const from = it.days;
        if (!shorter) {
          // A longer period replaces a shorten waiting on this type, so its
          // old `to` can't be approved later.
          for (const old of pending.filter(
            (r) => r.kind === "retention_shorten" && r.type === it.type,
          )) {
            pending = pending.filter((x) => x !== old);
            decided.add(old.id);
            log(person(m), "setting_change_cancelled", { target: words(old) });
          }
          it.days = days;
          it.version++;
          it.changed_by = person(m);
          it.changed_at = iso(now());
          log(person(m), "retention_changed", {
            target: `${RETENTION_WORDS[it.type]}: ${daysWords(from)} to ${daysWords(days)}`,
          });
          return out();
        }
        const req: SettingsRequest = {
          ...request(m, reason),
          kind: "retention_shorten",
          type: it.type,
          from,
          to: days,
        };
        pending.push(req);
        it.version++;
        log(person(m), "setting_change_requested", { target: words(req) });
        return out();
      }),

    setCleanUpPaused: (body, opts) =>
      core.write(opts, async (m) => {
        settle();
        const b = (body ?? {}) as Record<string, unknown>;
        if (typeof b.paused !== "boolean") invalid();
        text(b.reason, REASON_MAX);
        const version = versionOf(b);
        // Changed since the person looked, or already so: a clash.
        if (version !== pauseVersion) fail(409, "conflict");
        if (b.paused === cleanUp.paused) fail(409, "conflict");
        await core.checkCode(m, body);
        pauseVersion++;
        cleanUp.paused = b.paused as boolean;
        cleanUp.paused_by = cleanUp.paused ? person(m) : null;
        cleanUp.paused_at = cleanUp.paused ? iso(now()) : null;
        log(person(m), cleanUp.paused ? "clean_up_paused" : "clean_up_resumed");
        return out();
      }),

    setTriage: (body, opts) =>
      core.write(opts, async (m) => {
        settle();
        const b = (body ?? {}) as Record<string, unknown>;
        if (typeof b.enabled !== "boolean") invalid();
        const on = b.enabled as boolean;
        const reason = text(b.reason, REASON_MAX);
        const signoff = on ? text(b.clinical_signoff, SIGNOFF_MAX) : "";
        const version = versionOf(b);
        if (version !== triage.version) fail(409, "conflict");
        if (on === triage.enabled) fail(409, "conflict");
        if (on && pending.some((r) => r.kind === "triage_on"))
          fail(409, "conflict");
        if (on && !ready()) fail(409, "not_ready");
        await core.checkCode(m, body);
        if (!on) {
          triage.enabled = false;
          sharedTriage.enabled = false;
          triage.version++;
          triage.changed_by = person(m);
          triage.changed_at = iso(now());
          log(person(m), "triage_switched_off");
          return out();
        }
        const req: SettingsRequest = {
          ...request(m, reason),
          kind: "triage_on",
          from: false,
          to: true,
          clinical_signoff: signoff,
        };
        pending.push(req);
        triage.version++;
        log(person(m), "setting_change_requested", { target: words(req) });
        return out();
      }),

    approveRequest: (id, body, opts) =>
      core.write(opts, async (m) => {
        settle();
        const version = versionOf(body);
        const r = pending.find((x) => x.id === id);
        if (!r) {
          if (lapsed.has(id)) return fail(409, "expired");
          return decided.has(id)
            ? fail(409, "conflict")
            : fail(404, "not_found");
        }
        // Only the request the approver saw.
        if (version !== settingVersion(r)) fail(409, "conflict");
        // Only the server's record of who asked decides, never a name.
        if (r.requested_by.id === m.id) fail(409, "same_person");
        if (r.kind === "triage_on" && !ready()) fail(409, "not_ready");
        await core.checkCode(m, body);
        const at = iso(now());
        if (r.kind === "triage_on") {
          triage.enabled = true;
          sharedTriage.enabled = true;
          triage.changed_by = person(m);
          triage.changed_at = at;
        } else {
          const it = item(r.type);
          it.days = r.to;
          it.changed_by = person(m);
          it.changed_at = at;
        }
        bump(r);
        decided.add(r.id);
        pending = pending.filter((x) => x !== r);
        log(person(m), "setting_change_approved", { target: words(r) });
        return out();
      }),

    cancelRequest: (id, body, opts) =>
      core.write(opts, (m) => {
        settle();
        const version = versionOf(body);
        const r = pending.find((x) => x.id === id);
        if (!r)
          return lapsed.has(id) || decided.has(id)
            ? fail(409, "conflict")
            : fail(404, "not_found");
        if (version !== settingVersion(r)) fail(409, "conflict");
        bump(r);
        decided.add(r.id);
        pending = pending.filter((x) => x !== r);
        log(person(m), "setting_change_cancelled", { target: words(r) });
        return out();
      }),

    resetFeedbackBuffer: (body, opts) =>
      core.write(opts, async (m) => {
        settle();
        const reason = text(
          (body as { reason?: unknown } | null)?.reason,
          REASON_MAX,
        );
        if (buffer.running) fail(409, "conflict");
        await core.checkCode(m, body);
        const job_id = core.newId("job");
        buffer.running = { job_id, started_at: iso(now()) };
        buffer.failed_job_id = null;
        runFails = typeof resetFails === "function" ? resetFails() : resetFails;
        resetBy = person(m);
        resetReason = reason;
        return { job_id };
      }),
  };
}
