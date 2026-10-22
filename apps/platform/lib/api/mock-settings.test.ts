import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";
import type { RetentionItem } from "./settings-contract";
import { MOCK_CODE, createStepUp } from "./step-up";

const START = Date.parse("2026-10-22T09:30:00.000Z");
const D = 24 * 3_600_000;
let n = 0;
const KEY = () => ({ idempotencyKey: `s-${++n}` });
const CODE = { mfa_code: MOCK_CODE };
const WRONG = { mfa_code: "000000" };

function setup(
  over: {
    email?: string | null;
    triage?: "ready" | "not_ready";
    resetFails?: boolean;
  } = {},
) {
  let t = START;
  let me = over.email === undefined ? TEAM_EMAILS.ada : over.email;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    triage: over.triage,
    resetFails: over.resetFails,
  });
  return {
    m,
    as: (e: string | null) => void (me = e),
    advance: (ms: number) => void (t += ms),
  };
}
type Mock = ReturnType<typeof setup>["m"];

async function failure(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
  throw new Error("expected a refusal");
}

const item = async (m: Mock, type: RetentionItem["type"]) =>
  (await m.getSettings()).retention.items.find((i) => i.type === type)!;
const actions = async (m: Mock) =>
  (await m.listActivity({})).events.map((e) => e.action);
const reason = "Agreed with the compliance lead";

describe("mock settings", () => {
  it("starts from the placeholders", async () => {
    const { m } = setup();
    const s = await m.getSettings();
    expect(s.retention.confirmed).toBe(false);
    expect(s.retention.paused).toBe(false);
    expect(
      s.retention.items.map((i) => [i.type, i.days, i.minimum_days]),
    ).toEqual([
      ["records", 2190, 365],
      ["documents", 2190, 365],
      ["pending_corrections", 365, 30],
      ["audit_log", 2190, 2190],
    ]);
    const r = s.retention.items[0]!;
    expect(r.last_run).toEqual({
      at: "2026-10-21T02:00:00.000Z",
      ok: true,
      deleted: 312,
      kept_for_holds: 1840,
    });
    expect(r.next_run_at).toBe("2026-10-23T02:00:00.000Z");
    expect(s.triage).toMatchObject({
      enabled: false,
      ready: true,
      not_ready_reason: null,
    });
    expect(s.feedback_buffer).toEqual({
      waiting: 37,
      last_reset: {
        by: { id: "tm_tunde", name: "Tunde Okafor" },
        at: new Date(START - 60 * D).toISOString(),
        reason: "Test run data from a training session",
        cleared: 112,
      },
      running: null,
      failed_job_id: null,
    });
    expect(s.pending).toEqual([]);
    const nr = await setup({ triage: "not_ready" }).m.getSettings();
    expect(nr.triage).toMatchObject({
      ready: false,
      not_ready_reason: "missing_report",
    });
  });

  it("longer applies at once", async () => {
    const { m } = setup();
    const v = (await item(m, "records")).version;
    const s = await m.setRetention(
      "records",
      { days: 2555, reason, version: v, ...CODE },
      KEY(),
    );
    const r = s.retention.items.find((i) => i.type === "records")!;
    expect(r.days).toBe(2555);
    expect(r.version).toBe(v + 1);
    expect(r.changed_by).toEqual({ id: "tm_ada", name: "Ada Bakare" });
    expect(r.changed_at).toBe(new Date(START).toISOString());
    expect(s.pending).toEqual([]);
    expect((await actions(m))[0]).toBe("retention_changed");
  });

  it("shorter makes a pending request and keeps the old period", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    const s = await m.setRetention(
      "records",
      { days: 1095, reason, version: v, ...CODE },
      KEY(),
    );
    expect(s.retention.items[0]!.days).toBe(2190);
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]).toMatchObject({
      kind: "retention_shorten",
      type: "records",
      from: 2190,
      to: 1095,
      reason,
      requested_by: { id: "tm_ada", name: "Ada Bakare" },
      requested_by_you: true,
      expires_at: new Date(START + 7 * D).toISOString(),
    });
    expect((await actions(m))[0]).toBe("setting_change_requested");
    // The other admin sees it as not theirs.
    as(TEAM_EMAILS.tunde);
    expect((await m.getSettings()).pending[0]!.requested_by_you).toBe(false);
  });

  it("the preview counts and is 0 for longer", async () => {
    const { m } = setup();
    expect(await m.previewRetention("records", 2190)).toEqual({
      would_delete: 0,
    });
    expect(await m.previewRetention("records", 3000)).toEqual({
      would_delete: 0,
    });
    expect(await m.previewRetention("records", 1095)).toEqual({
      would_delete: Math.round(((2190 - 1095) / 365) * 4100),
    });
    expect(await failure(m.previewRetention("nope" as never, 10))).toEqual([
      404,
      "not_found",
    ]);
    expect(await failure(m.previewRetention("records", 0))).toEqual([
      422,
      "invalid",
    ]);
  });

  it("below the minimum is below_minimum", async () => {
    const { m } = setup();
    const v = (await item(m, "audit_log")).version;
    expect(
      await failure(
        m.setRetention(
          "audit_log",
          { days: 2189, reason, version: v, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([422, "below_minimum"]);
    const c = (await item(m, "pending_corrections")).version;
    expect(
      await failure(
        m.setRetention(
          "pending_corrections",
          { days: 29, reason, version: c, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([422, "below_minimum"]);
    expect((await m.getSettings()).pending).toEqual([]);
  });

  it("a stale version is conflict", async () => {
    const { m } = setup();
    const v = (await item(m, "records")).version;
    await m.setRetention(
      "records",
      { days: 2555, reason, version: v, ...CODE },
      KEY(),
    );
    expect(
      await failure(
        m.setRetention(
          "records",
          { days: 3000, reason, version: v, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    const t = (await m.getSettings()).triage.version;
    await m.setTriage(
      {
        enabled: true,
        reason,
        clinical_signoff: "Dr A, ref 1",
        version: t,
        ...CODE,
      },
      KEY(),
    );
    expect(
      await failure(
        m.setTriage(
          { enabled: true, reason, clinical_signoff: "x", version: t, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("the requester's approval is same_person", async () => {
    const { m } = setup();
    const v = (await item(m, "records")).version;
    const s = await m.setRetention(
      "records",
      { days: 1095, reason, version: v, ...CODE },
      KEY(),
    );
    const req = s.pending[0]!;
    expect(
      await failure(
        m.approveRequest(req.id, { version: req.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "same_person"]);
    expect((await item(m, "records")).days).toBe(2190);
  });

  it("a different admin's approval applies the change", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    const req = (
      await m.setRetention(
        "records",
        { days: 1095, reason, version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.tunde);
    const seen = (await m.getSettings()).pending[0]!;
    const s = await m.approveRequest(
      req.id,
      { version: seen.version, ...CODE },
      KEY(),
    );
    expect(s.pending).toEqual([]);
    const r = s.retention.items[0]!;
    expect(r.days).toBe(1095);
    expect(r.changed_by).toEqual({ id: "tm_tunde", name: "Tunde Okafor" });
    expect((await actions(m))[0]).toBe("setting_change_approved");
    // A request gone is not found.
    expect(
      await failure(
        m.approveRequest(req.id, { version: r.version, ...CODE }, KEY()),
      ),
    ).toEqual([404, "not_found"]);
  });

  it("approval after 7 days is expired", async () => {
    const { m, as, advance } = setup();
    const v = (await item(m, "records")).version;
    const req = (
      await m.setRetention(
        "records",
        { days: 1095, reason, version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.tunde);
    advance(7 * D + 1000);
    expect(
      await failure(
        m.approveRequest(req.id, { version: req.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "expired"]);
    const s = await m.getSettings();
    expect(s.pending).toEqual([]);
    expect(s.retention.items[0]!.days).toBe(2190);
    expect(await actions(m)).toContain("setting_change_lapsed");
    // It lapses once.
    await m.getSettings();
    expect(
      (await actions(m)).filter((a) => a === "setting_change_lapsed"),
    ).toHaveLength(1);
  });

  it("approving or cancelling with an old version is conflict", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    const req = (
      await m.setRetention(
        "records",
        { days: 1095, reason, version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    // Something else changes the same setting meanwhile.
    const now = (await item(m, "records")).version;
    expect(now).toBe(req.version);
    as(TEAM_EMAILS.tunde);
    expect(
      await failure(
        m.approveRequest(req.id, { version: req.version - 1, ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(
        m.cancelRequest(req.id, { version: req.version - 1 }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    expect((await m.getSettings()).pending).toHaveLength(1);
  });

  it("either admin cancels, with no code", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    const req = (
      await m.setRetention(
        "records",
        { days: 1095, reason, version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    const s = await m.cancelRequest(req.id, { version: req.version }, KEY());
    expect(s.pending).toEqual([]);
    expect(s.retention.items[0]!.days).toBe(2190);
    expect((await actions(m))[0]).toBe("setting_change_cancelled");
    // The other admin may cancel one too.
    const v2 = (await item(m, "documents")).version;
    const r2 = (
      await m.setRetention(
        "documents",
        { days: 1095, reason, version: v2, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.tunde);
    expect(
      (await m.cancelRequest(r2.id, { version: r2.version }, KEY())).pending,
    ).toEqual([]);
  });

  it("triage on needs ready and a sign-off; approval re-checks ready", async () => {
    const { m, as } = setup();
    const v = (await m.getSettings()).triage.version;
    const on = { enabled: true, reason, version: v, ...CODE };
    expect(await failure(m.setTriage(on, KEY()))).toEqual([422, "invalid"]);
    expect(
      await failure(m.setTriage({ ...on, clinical_signoff: " " }, KEY())),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.setTriage({ ...on, clinical_signoff: "x".repeat(201) }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    const s = await m.setTriage(
      { ...on, clinical_signoff: "Dr Eze, ref CS-12" },
      KEY(),
    );
    expect(s.triage.enabled).toBe(false);
    expect(s.pending[0]).toMatchObject({
      kind: "triage_on",
      from: false,
      to: true,
      clinical_signoff: "Dr Eze, ref CS-12",
    });
    as(TEAM_EMAILS.tunde);
    const req = (await m.getSettings()).pending[0]!;
    const done = await m.approveRequest(
      req.id,
      { version: req.version, ...CODE },
      KEY(),
    );
    expect(done.triage.enabled).toBe(true);
    expect(done.triage.changed_by).toEqual({
      id: "tm_tunde",
      name: "Tunde Okafor",
    });
    expect(done.pending).toEqual([]);
    expect((await m.getHealth()).triage.enabled).toBe(true);
  });

  it("triage on is not_ready when it isn't", async () => {
    const { m } = setup({ triage: "not_ready" });
    const v = (await m.getSettings()).triage.version;
    expect(
      await failure(
        m.setTriage(
          {
            enabled: true,
            reason,
            clinical_signoff: "ref",
            version: v,
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([409, "not_ready"]);
    expect((await m.getSettings()).pending).toEqual([]);
  });

  it("approval re-checks ready", async () => {
    // A request made while ready, approved after readiness is lost.
    let ready: "ready" | "not_ready" = "ready";
    let me: string = TEAM_EMAILS.ada;
    const m = createMockPlatform({
      now: () => START,
      me: () => me,
      delayMs: 0,
      stepUp: createStepUp(() => START),
      triage: () => ready,
    });
    const v = (await m.getSettings()).triage.version;
    const req = (
      await m.setTriage(
        { enabled: true, reason, clinical_signoff: "ref", version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    ready = "not_ready";
    me = TEAM_EMAILS.tunde;
    expect(
      await failure(
        m.approveRequest(req.id, { version: req.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "not_ready"]);
    expect((await m.getSettings()).triage.enabled).toBe(false);
  });

  it("triage off is at once", async () => {
    const { m, as } = setup();
    let v = (await m.getSettings()).triage.version;
    // Off when already off is a clash.
    expect(
      await failure(
        m.setTriage({ enabled: false, reason, version: v, ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    const req = (
      await m.setTriage(
        { enabled: true, reason, clinical_signoff: "ref", version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.tunde);
    await m.approveRequest(req.id, { version: req.version, ...CODE }, KEY());
    v = (await m.getSettings()).triage.version;
    const s = await m.setTriage(
      { enabled: false, reason, version: v, ...CODE },
      KEY(),
    );
    expect(s.triage.enabled).toBe(false);
    expect(s.triage.version).toBe(v + 1);
    expect((await actions(m))[0]).toBe("triage_switched_off");
    expect((await m.getHealth()).triage.enabled).toBe(false);
  });

  it("pausing the clean-up is at once and shows in health", async () => {
    const { m } = setup();
    const s = await m.setCleanUpPaused(
      { paused: true, reason, ...CODE },
      KEY(),
    );
    expect(s.retention).toMatchObject({
      paused: true,
      paused_by: { id: "tm_ada", name: "Ada Bakare" },
      paused_at: new Date(START).toISOString(),
    });
    expect((await actions(m))[0]).toBe("clean_up_paused");
    expect((await m.getHealth()).clean_up).toMatchObject({
      paused: true,
      paused_by: { id: "tm_ada", name: "Ada Bakare" },
    });
    expect(
      await failure(
        m.setCleanUpPaused({ paused: true, reason, ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    const back = await m.setCleanUpPaused(
      { paused: false, reason, ...CODE },
      KEY(),
    );
    expect(back.retention).toMatchObject({
      paused: false,
      paused_by: null,
      paused_at: null,
    });
    expect((await actions(m))[0]).toBe("clean_up_resumed");
    expect((await m.getHealth()).clean_up.paused).toBe(false);
  });

  it("the reset runs, then clears; resetFails sets failed_job_id", async () => {
    const { m, advance } = setup();
    const { job_id } = await m.resetFeedbackBuffer({ reason, ...CODE }, KEY());
    expect(job_id).toMatch(/^[A-Za-z0-9_-]+$/);
    let fb = (await m.getSettings()).feedback_buffer;
    expect(fb.running).toEqual({
      job_id,
      started_at: new Date(START).toISOString(),
    });
    expect(fb.waiting).toBe(37);
    // Not twice at once.
    expect(
      await failure(m.resetFeedbackBuffer({ reason, ...CODE }, KEY())),
    ).toEqual([409, "conflict"]);
    advance(3000);
    fb = (await m.getSettings()).feedback_buffer;
    expect(fb.running).toBeNull();
    expect(fb.waiting).toBe(0);
    expect(fb.last_reset).toEqual({
      by: { id: "tm_ada", name: "Ada Bakare" },
      at: new Date(START + 3000).toISOString(),
      reason,
      cleared: 37,
    });
    const ev = (await m.listActivity({})).events[0]!;
    expect(ev.action).toBe("feedback_buffer_cleared");
    expect(ev.target).toBe("37");

    const f = setup({ resetFails: true });
    const r = await f.m.resetFeedbackBuffer({ reason, ...CODE }, KEY());
    f.advance(3000);
    const after = (await f.m.getSettings()).feedback_buffer;
    expect(after.running).toBeNull();
    expect(after.failed_job_id).toBe(r.job_id);
    expect(after.waiting).toBe(37);
    expect(after.last_reset!.cleared).toBe(112);
    expect(await actions(f.m)).not.toContain("feedback_buffer_cleared");
  });

  it("every write except cancelRequest needs the code", async () => {
    const { m } = setup();
    const v = (await item(m, "records")).version;
    const t = (await m.getSettings()).triage.version;
    // No code at all: 422. A wrong one: 403. Nothing changes either way.
    const bare = [
      () =>
        m.setRetention(
          "records",
          { days: 2555, reason, version: v } as never,
          KEY(),
        ),
      () => m.setCleanUpPaused({ paused: true, reason } as never, KEY()),
      () =>
        m.setTriage(
          { enabled: true, reason, clinical_signoff: "r", version: t } as never,
          KEY(),
        ),
      () => m.resetFeedbackBuffer({ reason } as never, KEY()),
    ];
    for (const w of bare) expect(await failure(w())).toEqual([422, "invalid"]);
    const wrong = [
      () =>
        m.setRetention(
          "records",
          { days: 2555, reason, version: v, ...WRONG },
          KEY(),
        ),
      () => m.setCleanUpPaused({ paused: true, reason, ...WRONG }, KEY()),
      () =>
        m.setTriage(
          {
            enabled: true,
            reason,
            clinical_signoff: "r",
            version: t,
            ...WRONG,
          },
          KEY(),
        ),
    ];
    for (const w of wrong)
      expect(await failure(w())).toEqual([403, "mfa_invalid"]);
    const s = await m.getSettings();
    expect(s.pending).toEqual([]);
    expect(s.retention).toMatchObject({ paused: false });
    expect(s.retention.items[0]!.days).toBe(2190);
    expect(s.feedback_buffer.running).toBeNull();
  });

  it("approve needs the code", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    const req = (
      await m.setRetention(
        "records",
        { days: 1095, reason, version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.tunde);
    expect(
      await failure(
        m.approveRequest(req.id, { version: req.version, ...WRONG }, KEY()),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect((await m.getSettings()).pending).toHaveLength(1);
  });

  it("an auditor reads but can't write", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    const req = (
      await m.setRetention(
        "records",
        { days: 1095, reason, version: v, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.amara);
    expect((await m.getSettings()).retention.items).toHaveLength(4);
    expect(await m.previewRetention("records", 1095)).toBeTruthy();
    const t = (await m.getSettings()).triage.version;
    const writes: (() => Promise<unknown>)[] = [
      () =>
        m.setRetention(
          "records",
          { days: 2555, reason, version: v, ...CODE },
          KEY(),
        ),
      () => m.setCleanUpPaused({ paused: true, reason, ...CODE }, KEY()),
      () =>
        m.setTriage(
          { enabled: true, reason, clinical_signoff: "r", version: t, ...CODE },
          KEY(),
        ),
      () => m.approveRequest(req.id, { version: req.version, ...CODE }, KEY()),
      () => m.cancelRequest(req.id, { version: req.version }, KEY()),
      () => m.resetFeedbackBuffer({ reason, ...CODE }, KEY()),
    ];
    for (const w of writes)
      expect(await failure(w())).toEqual([403, "forbidden"]);
    as(TEAM_EMAILS.ada);
    expect((await m.getSettings()).pending).toHaveLength(1);
  });

  it("signed out is session_expired", async () => {
    const { m } = setup({ email: null });
    expect(await failure(m.getSettings())).toEqual([401, "session_expired"]);
  });

  it("the same Idempotency-Key replays without doing it twice", async () => {
    const { m } = setup();
    const v = (await item(m, "records")).version;
    const k = KEY();
    const body = { days: 2555, reason, version: v, ...CODE };
    const a = await m.setRetention("records", body, k);
    const b = await m.setRetention("records", body, k);
    expect(b).toEqual(a);
    expect((await item(m, "records")).version).toBe(v + 1);
  });

  it("refuses bad input", async () => {
    const { m } = setup();
    const v = (await item(m, "records")).version;
    const ok = { days: 2555, reason, version: v, ...CODE };
    for (const bad of [
      { ...ok, days: 1.5 },
      { ...ok, days: "9" },
      { ...ok, reason: "" },
      { ...ok, reason: "x".repeat(501) },
      { ...ok, version: "1" },
    ])
      expect(
        await failure(m.setRetention("records", bad as never, KEY())),
      ).toEqual([422, "invalid"]);
    expect(await failure(m.setRetention("nope" as never, ok, KEY()))).toEqual([
      404,
      "not_found",
    ]);
    expect(
      await failure(
        m.setCleanUpPaused({ paused: "yes", reason, ...CODE } as never, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(m.resetFeedbackBuffer({ reason: " ", ...CODE }, KEY())),
    ).toEqual([422, "invalid"]);
  });

  it("every change logs activity", async () => {
    const { m, as } = setup();
    const v = (await item(m, "records")).version;
    await m.setRetention(
      "records",
      { days: 2555, reason, version: v + 0, ...CODE },
      KEY(),
    );
    const v2 = (await item(m, "documents")).version;
    const req = (
      await m.setRetention(
        "documents",
        { days: 1095, reason, version: v2, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    as(TEAM_EMAILS.tunde);
    await m.approveRequest(req.id, { version: req.version, ...CODE }, KEY());
    const v3 = (await item(m, "pending_corrections")).version;
    const r3 = (
      await m.setRetention(
        "pending_corrections",
        { days: 90, reason, version: v3, ...CODE },
        KEY(),
      )
    ).pending[0]!;
    await m.cancelRequest(r3.id, { version: r3.version }, KEY());
    await m.setCleanUpPaused({ paused: true, reason, ...CODE }, KEY());
    await m.setCleanUpPaused({ paused: false, reason, ...CODE }, KEY());
    await m.resetFeedbackBuffer({ reason, ...CODE }, KEY());
    const events = (await m.listActivity({})).events;
    expect(events.slice(0, 7).map((e) => e.action)).toEqual([
      "clean_up_resumed",
      "clean_up_paused",
      "setting_change_cancelled",
      "setting_change_requested",
      "setting_change_approved",
      "setting_change_requested",
      "retention_changed",
    ]);
    // Who did it, and never the reason's free text.
    expect(events[0]!.actor.id).toBe("tm_tunde");
    expect(JSON.stringify(events.slice(0, 7))).not.toContain(reason);
  });
});
