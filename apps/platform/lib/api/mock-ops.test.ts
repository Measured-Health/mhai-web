import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { seedHospitals, seedTeam, TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";
import { setDemoHealth } from "./mock-ops";
import { JOBS_MAX, OLD_QUESTION_MS, type HealthOut } from "./ops-contract";
import type { HealthMode } from "./ops-fixtures";

const START = Date.parse("2026-10-22T09:30:00.000Z");
const CODE = { mfa_code: "123456" };
let n = 0;
const KEY = () => ({ idempotencyKey: `ko-${++n}` });

function setup(health?: HealthMode, email: string | null = TEAM_EMAILS.ada) {
  const m = createMockPlatform({
    now: () => START,
    me: () => email,
    delayMs: 0,
    health,
  });
  const as = (e: string) =>
    createMockPlatform({ now: () => START, me: () => e, delayMs: 0 });
  return { m, as };
}

async function failure(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
  throw new Error("expected a refusal");
}

const status = (h: HealthOut, key: string) =>
  h.parts.find((p) => p.key === key)?.status;

describe("mock health", () => {
  it("each health mode gives its statuses", async () => {
    const normal = await setup("normal").m.getHealth();
    expect(normal.overall).toBe("ok");
    expect(normal.parts.map((p) => p.key)).toEqual([
      "app",
      "workers",
      "evidence",
      "documents",
      "guidelines",
      "clean_up",
    ]);
    expect(normal.parts.every((p) => p.status === "ok")).toBe(true);
    expect(normal.triage).toEqual({ enabled: false });
    expect(normal.clean_up.paused).toBe(false);
    // The default is normal.
    expect((await setup().m.getHealth()).overall).toBe("ok");

    const slow = await setup("slow").m.getHealth();
    expect(slow.overall).toBe("slow");
    expect(status(slow, "workers")).toBe("slow");
    expect(status(slow, "evidence")).toBe("slow");
    expect(status(slow, "documents")).toBe("ok");
    expect(slow.timing.last_hour.overall.p95_ms).toBeGreaterThan(
      normal.timing.last_hour.overall.p95_ms,
    );
    expect(slow.timing.last_hour.steps.map((s) => s.step)).toEqual([
      "privacy",
      "guidelines",
      "answer",
      "evidence",
    ]);

    const problem = await setup("problem").m.getHealth();
    expect(problem.overall).toBe("problem");
    expect(status(problem, "documents")).toBe("problem");
    expect(status(problem, "workers")).toBe("ok");
    const errs = (k: string) =>
      problem.errors.find((e) => e.kind === k)!.last_hour;
    expect(errs("unreadable")).toBeGreaterThan(0);
    expect(errs("timeout")).toBeGreaterThan(0);
  });

  it("failed jobs match the job list", async () => {
    const { m } = setup();
    const h = await m.getHealth();
    const failed = await m.listJobs({});
    expect(h.failed_jobs.now).toBe(failed.jobs.length);
    expect(h.failed_jobs.last_24h).toBeGreaterThanOrEqual(h.failed_jobs.now);
    await m.retryJobs({ ids: [failed.jobs[0]!.id] }, KEY());
    expect((await m.getHealth()).failed_jobs.now).toBe(failed.jobs.length - 1);
  });

  it("stale is 5 minutes old", async () => {
    const h = await setup("stale").m.getHealth();
    expect(START - Date.parse(h.updated_at)).toBe(5 * 60_000);
    const fresh = await setup("normal").m.getHealth();
    expect(START - Date.parse(fresh.updated_at)).toBeLessThan(60_000);
  });

  it("unavailable is 503", async () => {
    expect(await failure(setup("unavailable").m.getHealth())).toEqual([
      503,
      "unavailable",
    ]);
  });

  it("setDemoHealth changes the running demo", async () => {
    const { m } = setup("normal");
    setDemoHealth("problem");
    expect((await m.getHealth()).overall).toBe("problem");
    setDemoHealth("normal");
    expect((await m.getHealth()).overall).toBe("ok");
  });

  it("health never names a hospital or person", async () => {
    const names = [
      ...seedHospitals(START).map((r) => r.hospital.name),
      ...seedTeam(START).map((t) => t.name),
    ];
    for (const mode of ["normal", "slow", "problem", "stale"] as const) {
      const json = JSON.stringify(await setup(mode).m.getHealth());
      for (const name of names) expect(json).not.toContain(name);
    }
  });

  it("an auditor can read it", async () => {
    const { as } = setup();
    expect((await as(TEAM_EMAILS.amara).getHealth()).overall).toBe("ok");
  });

  it("needs someone signed in", async () => {
    const { m } = setup("normal", null);
    expect(await failure(m.getHealth())).toEqual([401, "session_expired"]);
    expect(await failure(m.listJobs({}))).toEqual([401, "session_expired"]);
  });
});

describe("mock jobs", () => {
  it("jobs default to failed, newest first; the filters narrow", async () => {
    const { m } = setup();
    const { jobs, next_cursor } = await m.listJobs({});
    expect(next_cursor).toBeNull();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.status === "failed")).toBe(true);
    const times = jobs.map((j) => Date.parse(j.failed_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(jobs.every((j) => /^[A-Za-z0-9_-]+$/.test(j.id))).toBe(true);

    const all = (await m.listJobs({ status: "all" })).jobs;
    expect(all.length).toBeGreaterThan(jobs.length);
    // Every type and every error kind appears at least once.
    expect(new Set(all.map((j) => j.type)).size).toBe(8);
    expect(new Set(all.map((j) => j.kind)).size).toBe(5);
    expect(all.filter((j) => j.status === "retried")).toHaveLength(1);
    const cancelled = all.filter((j) => j.status === "cancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.cancelled_by).toEqual({
      id: "tm_tunde",
      name: "Tunde Okafor",
    });
    expect(cancelled[0]!.cancelled_at).not.toBeNull();
    const platform = all.filter((j) => j.hospital === null);
    expect(platform.map((j) => j.type).sort()).toEqual([
      "feedback_buffer_reset",
      "retention_purge",
    ]);

    // An old question: first tried 2 days ago, at Northgate.
    const old = jobs.find((j) => j.type === "run_query")!;
    expect(old.hospital?.id).toBe("h_northgate");
    expect(START - Date.parse(old.created_at)).toBeGreaterThan(OLD_QUESTION_MS);

    expect(
      (await m.listJobs({ status: "cancelled" })).jobs.map((j) => j.status),
    ).toEqual(["cancelled"]);
    expect(
      (await m.listJobs({ type: "retention_purge" })).jobs.map((j) => j.type),
    ).toEqual(["retention_purge"]);
    const north = await m.listJobs({ hospital: "h_northgate" });
    expect(north.jobs.length).toBeGreaterThan(0);
    expect(north.jobs.every((j) => j.hospital?.id === "h_northgate")).toBe(
      true,
    );
    const unreadable = await m.listJobs({ kind: "unreadable" });
    expect(unreadable.jobs.map((j) => j.type)).toEqual(["ingest_document"]);
    expect(
      (await m.listJobs({ kind: "timeout", type: "kb_search" })).jobs,
    ).toHaveLength(1);
  });

  it("an unknown filter value is invalid", async () => {
    const { m } = setup();
    for (const q of [
      { status: "nope" },
      { type: "nope" },
      { kind: "nope" },
    ] as never[])
      expect(await failure(m.listJobs(q))).toEqual([422, "invalid"]);
  });

  it("retry of 51 is invalid", async () => {
    const { m } = setup();
    const ids = Array.from({ length: JOBS_MAX + 1 }, (_, i) => `job_x${i}`);
    expect(await failure(m.retryJobs({ ids }, KEY()))).toEqual([
      422,
      "invalid",
    ]);
    expect(await failure(m.retryJobs({ ids: [] }, KEY()))).toEqual([
      422,
      "invalid",
    ]);
    expect(await failure(m.retryJobs({} as never, KEY()))).toEqual([
      422,
      "invalid",
    ]);
    expect(await failure(m.retryJobs({ ids: [1] } as never, KEY()))).toEqual([
      422,
      "invalid",
    ]);
  });

  it("retry without a code works", async () => {
    const { m } = setup();
    const out = await m.retryJobs({ ids: ["job_feedback_1"] }, KEY());
    expect(out).toEqual({ retried: ["job_feedback_1"], skipped: [] });
    const all = (await m.listJobs({ status: "all" })).jobs;
    expect(all.find((j) => j.id === "job_feedback_1")!.status).toBe("retried");
    expect((await m.listJobs({})).jobs.map((j) => j.id)).not.toContain(
      "job_feedback_1",
    );
  });

  it("retry skips a job retried meanwhile and returns both lists", async () => {
    const { m } = setup();
    await m.retryJobs({ ids: ["job_feedback_1"] }, KEY());
    const out = await m.retryJobs(
      {
        ids: [
          "job_feedback_1",
          "job_search_1",
          "job_question_done",
          "job_feedback_off",
          "job_nope",
        ],
      },
      KEY(),
    );
    expect(out.retried).toEqual(["job_search_1"]);
    expect(out.skipped.sort()).toEqual([
      "job_feedback_1",
      "job_feedback_off",
      "job_nope",
      "job_question_done",
    ]);
  });

  it("the same Idempotency-Key does it once", async () => {
    const { m } = setup();
    const k = KEY();
    const a = await m.retryJobs({ ids: ["job_search_1"] }, k);
    const b = await m.retryJobs({ ids: ["job_search_1"] }, k);
    expect(b).toEqual(a);
  });

  it("the unreadable document comes back failed with one more attempt", async () => {
    const { m } = setup();
    const before = (await m.listJobs({ kind: "unreadable" })).jobs[0]!;
    const out = await m.retryJobs({ ids: [before.id] }, KEY());
    expect(out).toEqual({ retried: [before.id], skipped: [] });
    const after = (await m.listJobs({ kind: "unreadable" })).jobs[0]!;
    expect(after.id).toBe(before.id);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(before.attempts + 1);
    expect(Date.parse(after.failed_at)).toBeGreaterThanOrEqual(
      Date.parse(before.failed_at),
    );
  });

  it("cancel needs the code; Other needs a note; skipped as for retry", async () => {
    const { m } = setup();
    const ids = ["job_search_1"];
    // No code, a wrong one: nothing changes.
    expect(
      await failure(
        m.cancelJobs({ ids, reason: "no_longer_needed" } as never, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.cancelJobs(
          { ids, reason: "no_longer_needed", mfa_code: "000000" },
          KEY(),
        ),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect((await m.listJobs({})).jobs.map((j) => j.id)).toContain(
      "job_search_1",
    );
    // Other needs a note; so does a blank one.
    for (const note of [undefined, "  "])
      expect(
        await failure(
          m.cancelJobs({ ids, reason: "other", note, ...CODE }, KEY()),
        ),
      ).toEqual([422, "invalid"]);
    // A bad reason, no ids, 51 ids.
    expect(
      await failure(
        m.cancelJobs({ ids, reason: "x" as never, ...CODE }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.cancelJobs({ ids: [], reason: "cant_succeed", ...CODE }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.cancelJobs(
          {
            ids: Array.from({ length: 51 }, (_, i) => `job_${i}`),
            reason: "cant_succeed",
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);

    const out = await m.cancelJobs(
      {
        ids: ["job_search_1", "job_question_done", "job_nope"],
        reason: "other",
        note: "Not needed any more.",
        ...CODE,
      },
      KEY(),
    );
    expect(out.cancelled).toEqual(["job_search_1"]);
    expect(out.skipped.sort()).toEqual(["job_nope", "job_question_done"]);
    const job = (await m.listJobs({ status: "all" })).jobs.find(
      (j) => j.id === "job_search_1",
    )!;
    expect(job).toMatchObject({
      status: "cancelled",
      cancelled_by: { id: "tm_ada", name: "Ada Bakare" },
      cancelled_at: new Date(START).toISOString(),
    });
    // Cancelled twice: skipped, not done again.
    const again = await m.cancelJobs(
      { ids: ["job_search_1"], reason: "cant_succeed", ...CODE },
      KEY(),
    );
    expect(again).toEqual({ cancelled: [], skipped: ["job_search_1"] });
  });

  it("an auditor can read but not retry or cancel", async () => {
    const { as } = setup();
    const a = as(TEAM_EMAILS.amara);
    expect((await a.listJobs({})).jobs.length).toBeGreaterThan(0);
    expect(
      await failure(a.retryJobs({ ids: ["job_search_1"] }, KEY())),
    ).toEqual([403, "forbidden"]);
    expect(
      await failure(
        a.cancelJobs(
          { ids: ["job_search_1"], reason: "cant_succeed", ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
    expect((await a.listJobs({})).jobs.map((j) => j.id)).toContain(
      "job_search_1",
    );
  });

  it("retry and cancel log activity", async () => {
    const { m } = setup();
    const before = (await m.listActivity({})).events.length;
    await m.retryJobs({ ids: ["job_search_1", "job_feedback_1"] }, KEY());
    await m.cancelJobs(
      { ids: ["job_triage_1"], reason: "no_longer_needed", ...CODE },
      KEY(),
    );
    // Nothing done, nothing logged.
    await m.retryJobs({ ids: ["job_search_1"] }, KEY());
    const { events } = await m.listActivity({});
    expect(events).toHaveLength(before + 2);
    expect(events[0]).toMatchObject({
      action: "jobs_cancelled",
      target: "1 failed job",
      detail: "No longer needed",
      actor: { id: "tm_ada" },
    });
    expect(events[1]).toMatchObject({
      action: "jobs_retried",
      target: "2 failed jobs",
    });
  });

  it("cancel logs the reason in words and never the note", async () => {
    const { m } = setup();
    await m.cancelJobs(
      {
        ids: ["job_triage_1"],
        reason: "other",
        note: "SECRET-NOTE",
        ...CODE,
      },
      KEY(),
    );
    await m.cancelJobs(
      { ids: ["job_search_1"], reason: "cant_succeed", ...CODE },
      KEY(),
    );
    const { events } = await m.listActivity({});
    expect(events[0]!.detail).toBe("Can't succeed");
    expect(events[1]!.detail).toBe("Other");
    expect(JSON.stringify(events)).not.toContain("SECRET-NOTE");
  });
});
