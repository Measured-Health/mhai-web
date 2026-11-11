import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import type {
  AnalyticsOut,
  Change,
  ChangesOut,
  Guarded,
  Period,
  QualityRow,
  UseRow,
} from "./analytics-contract";
import { readAnalytics, readSeries } from "../analytics/read";
import { readGuardrailPeriods } from "../analytics/guardrails";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";

// The latest finished week is 1–7 Nov, month October, quarter Jul–Sep.
const START = Date.parse("2026-11-11T09:30:00.000Z");
let n = 0;
const KEY = () => ({ idempotencyKey: `ka-${++n}` });
const PERIODS: Period[] = ["week", "month", "quarter"];

function setup(
  analytics?: "normal" | "unavailable" | "not_yet",
  email: string | null = TEAM_EMAILS.ada,
) {
  let me = email;
  const m = createMockPlatform({
    now: () => START,
    me: () => me,
    delayMs: 0,
    analytics,
  });
  return { m, as: (e: string | null) => void (me = e) };
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

type Ok<T> = Exclude<T, { unavailable: true } | { not_yet: true } | null>;
function ok<T>(v: T): Ok<T> {
  if (v && typeof v === "object" && ("unavailable" in v || "not_yet" in v))
    throw new Error("area not there");
  return v as Ok<T>;
}
const items = (a: AnalyticsOut) => (a.what_changed as ChangesOut).items;
const change = async (
  m: ReturnType<typeof setup>["m"],
  pick: (c: Change) => boolean,
) => {
  const c = items(await m.getAnalytics("month")).find(pick);
  if (!c) throw new Error("no such change");
  return c;
};
const byHospital = (id: string | null) => (c: Change) =>
  (c.hospital?.id ?? null) === id;
const NGH = (c: Change) => c.id === "chg_ngh_needs_review";

/** Every Guarded value anywhere in a reply, with where it sits. */
function guardedIn(v: unknown, at = "$"): [string, Guarded][] {
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  if ("suppressed" in o && "value" in o && Object.keys(o).length === 2)
    return [[at, o as Guarded]];
  return Object.entries(o).flatMap(([k, x]) => guardedIn(x, `${at}.${k}`));
}

function countsOf(a: AnalyticsOut): [string, Guarded][] {
  const out: [string, Guarded][] = [];
  const use = ok(a.use);
  const quality = ok(a.quality);
  for (const r of use.rows)
    for (const k of ["questions", "active_clinicians"] as const)
      out.push([`use.${r.hospital.id}.${k}`, r[k]]);
  for (const r of quality.rows) {
    out.push([`quality.${r.hospital.id}.answers`, r.answers]);
    out.push([`quality.${r.hospital.id}.reviews`, r.reviews]);
    for (const [k, g] of Object.entries(r.confidence))
      out.push([`quality.${r.hospital.id}.${k}`, g]);
  }
  use.trend.forEach((p, i) => out.push([`trend.${i}`, p.value]));
  for (const r of ok(a.hospitals).rows) {
    out.push([`size.${r.hospital.id}.staff`, r.size.staff]);
    out.push([`size.${r.hospital.id}.clin`, r.size.active_clinicians]);
    out.push([`size.${r.hospital.id}.q`, r.size.questions]);
  }
  return out;
}

describe("mock analytics", () => {
  it("every reply is the latest finished period of its kind (R41a)", async () => {
    const { m } = setup();
    const got = await Promise.all(PERIODS.map((p) => m.getAnalytics(p)));
    expect(got.map((a) => [a.period, a.from, a.to])).toEqual([
      ["week", "2026-11-01T00:00:00.000Z", "2026-11-08T00:00:00.000Z"],
      ["month", "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"],
      ["quarter", "2026-07-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    ]);
    expect(got.map((a) => ok(a.use).trend.length)).toEqual([12, 12, 8]);
    for (const [i, a] of got.entries()) {
      expect(a.changes).toEqual({ unavailable: true });
      expect(a.alerts).toBeNull();
      // The app reads every area of it.
      const s = readAnalytics(a, PERIODS[i]);
      for (const k of ["changes", "use", "quality", "hospitals"] as const)
        expect(s[k].status, `${a.period} ${k}`).toBe("ok");
    }
  });

  it("What changed is the same for every period and keeps its ids", async () => {
    const { m } = setup();
    const lists = await Promise.all(PERIODS.map((p) => m.getAnalytics(p)));
    const first = lists[0]!.what_changed as ChangesOut;
    expect(first.items.length).toBeGreaterThan(5);
    for (const a of lists) expect(a.what_changed).toEqual(first);
    expect(new Set(first.items.map((c) => c.id)).size).toBe(first.items.length);
    // The latest week against the month that finished before it began.
    expect(first.window).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-08T00:00:00.000Z",
    });
    for (const c of first.items) {
      // Core's measures, both sides shown, no hospital name in the summary.
      expect(["questions", "needs_review_share", "agreement_rate"]).toContain(
        c.measure,
      );
      expect(c.previous.suppressed || c.current.suppressed).toBe(false);
      expect(c.serious).toBe(false);
      if (c.hospital) expect(c.summary).not.toContain(c.hospital.name);
    }
    const river = first.items.find(byHospital("h_riverside"))!;
    expect(river.follow_up).toMatchObject({
      by: { id: "tm_tunde", name: "Tunde Okafor" },
      version: 1,
    });
  });

  it("counts 1–4 are suppressed, 0 is not, in every period", async () => {
    const { m } = setup();
    for (const p of PERIODS) {
      const a = await m.getAnalytics(p);
      for (const [at, g] of countsOf(a)) {
        if (g.value !== null)
          expect(g.value === 0 || g.value >= 5, `${p} ${at}`).toBe(true);
      }
      for (const [at, g] of guardedIn(a))
        if (g.suppressed) expect(g.value, `${p} ${at}`).toBeNull();
    }
    const use = ok((await m.getAnalytics("week")).use);
    const row = (id: string) => use.rows.find((r) => r.hospital.id === id)!;
    expect(row("h_lakeside").questions).toEqual({
      value: null,
      suppressed: true,
    });
    expect(row("h_lakeside").questions_per_clinician.suppressed).toBe(true);
    expect(row("h_hilltop").questions).toEqual({ value: 0, suppressed: false });
  });

  it("never sends a rate or share over a hidden count, nor an all-hospitals total beside a hidden hospital", async () => {
    const { m } = setup();
    for (const p of PERIODS) {
      const a = await m.getAnalytics(p);
      const use = ok(a.use);
      for (const r of [...use.rows, use.median as UseRow])
        if (r.questions.suppressed || r.active_clinicians.suppressed)
          expect(r.questions_per_clinician.suppressed).toBe(true);
      const quality = ok(a.quality);
      for (const r of [...quality.rows, quality.median as QualityRow]) {
        const mix = Object.values(r.confidence);
        if (mix.some((g) => g.suppressed))
          expect(mix.every((g) => g.suppressed)).toBe(true);
        if (r.answers.suppressed)
          expect(r.needs_review_share.suppressed).toBe(true);
      }
      // The latest trend point is this period's all-hospitals cell: hidden
      // when a hospital's own cell is, so all minus the rest gives nothing.
      if (use.rows.some((r) => r.questions.suppressed))
        expect(use.trend.at(-1)!.value.suppressed).toBe(true);
    }
  });

  it("an auditor can't follow up", async () => {
    const { m, as } = setup();
    const c = await change(m, NGH);
    as(TEAM_EMAILS.amara);
    expect(
      await failure(m.followUp(c.id, { version: c.version }, KEY())),
    ).toEqual([403, "forbidden"]);
    expect(
      await failure(m.undoFollowUp(c.id, { version: c.version }, KEY())),
    ).toEqual([403, "forbidden"]);
    // ...but sees everything, including who followed up.
    const river = await change(m, byHospital("h_riverside"));
    expect(river.follow_up?.by.name).toBe("Tunde Okafor");
  });

  it("by_you is true for the follow-up's author and false for another admin", async () => {
    const { m, as } = setup();
    const c = await change(m, NGH);
    const done = await m.followUp(c.id, { version: c.version }, KEY());
    expect(done.follow_up?.by_you).toBe(true);
    expect((await change(m, (x) => x.id === c.id)).follow_up?.by_you).toBe(
      true,
    );
    // Tunde's follow-up of Riverside is not Ada's.
    expect((await change(m, byHospital("h_riverside"))).follow_up?.by_you).toBe(
      false,
    );
    as(TEAM_EMAILS.tunde);
    expect((await change(m, (x) => x.id === c.id)).follow_up?.by_you).toBe(
      false,
    );
    expect((await change(m, byHospital("h_riverside"))).follow_up?.by_you).toBe(
      true,
    );
    // Undo by another admin replies with no follow-up at all.
    const undone = await m.undoFollowUp(c.id, { version: done.version }, KEY());
    expect(undone.follow_up).toBeNull();
  });

  it("a stale version is 409 conflict", async () => {
    const { m } = setup();
    const c = await change(m, NGH);
    const done = await m.followUp(c.id, { version: c.version }, KEY());
    expect(done.version).toBe(c.version + 1);
    expect(done.follow_up).toMatchObject({
      by: { id: "tm_ada", name: "Ada Bakare" },
      note: null,
      version: 1,
      at: new Date(START).toISOString(),
    });
    // A second admin, still holding the old version.
    expect(
      await failure(m.followUp(c.id, { version: c.version }, KEY())),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(m.undoFollowUp(c.id, { version: c.version }, KEY())),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(m.followUp("chg_nope", { version: 1 }, KEY())),
    ).toEqual([404, "not_found"]);
    // The same key gets the same reply without doing it again.
    const key = KEY();
    const once = await m.followUp(
      c.id,
      { note: "Called them.", version: done.version },
      key,
    );
    expect(
      await m.followUp(
        c.id,
        { note: "Called them.", version: done.version },
        key,
      ),
    ).toEqual(once);
  });

  it("a note is 1 to 500 characters, else 422 validation_failed (F7)", async () => {
    const { m } = setup();
    const c = await change(m, NGH);
    for (const note of ["x".repeat(501), ""])
      expect(
        await failure(m.followUp(c.id, { note, version: c.version }, KEY())),
      ).toEqual([422, "validation_failed"]);
    const fine = await m.followUp(
      c.id,
      { note: "x".repeat(500), version: c.version },
      KEY(),
    );
    expect(fine.follow_up?.note).toBe("x".repeat(500));
    // Null is no note: the author clears it.
    const cleared = await m.followUp(
      c.id,
      { note: null, version: fine.version },
      KEY(),
    );
    expect(cleared.follow_up?.note).toBeNull();
  });

  it("only the author edits a note; any platform admin can undo", async () => {
    const { m } = setup();
    // Riverside was followed up by Tunde; Ada can't edit his note.
    const river = await change(m, byHospital("h_riverside"));
    expect(
      await failure(
        m.followUp(
          river.id,
          { note: "Mine now", version: river.version },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
    // Tunde edits his own note: the follow-up's version moves on.
    const tunde = setup();
    const r2 = await change(tunde.m, byHospital("h_riverside"));
    tunde.as(TEAM_EMAILS.tunde);
    const edited = await tunde.m.followUp(
      r2.id,
      { note: "Spoke to the matron again.", version: r2.version },
      KEY(),
    );
    expect(edited.follow_up).toMatchObject({
      by: { id: "tm_tunde" },
      note: "Spoke to the matron again.",
      version: r2.follow_up!.version + 1,
      at: r2.follow_up!.at,
    });
    // Ada undoes Tunde's follow-up.
    tunde.as(TEAM_EMAILS.ada);
    const undone = await tunde.m.undoFollowUp(
      r2.id,
      { version: edited.version },
      KEY(),
    );
    expect(undone.follow_up).toBeNull();
    expect(undone.version).toBe(edited.version + 1);
    const after = await change(tunde.m, byHospital("h_riverside"));
    expect(after).toEqual(undone);
    // Nothing left to undo.
    expect(
      await failure(
        tunde.m.undoFollowUp(r2.id, { version: undone.version }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("follow-up writes log activity", async () => {
    const { m } = setup();
    const events = async () => (await m.listActivity({})).events;
    const before = (await events()).length;
    const c = await change(m, NGH);
    const a = await m.followUp(c.id, { version: c.version }, KEY());
    const b = await m.followUp(
      c.id,
      { note: "Asked the ward to check the pager rota.", version: a.version },
      KEY(),
    );
    await m.undoFollowUp(c.id, { version: b.version }, KEY());
    const list = await events();
    expect(list).toHaveLength(before + 3);
    expect(list.slice(0, 3).map((e) => e.action)).toEqual([
      "change_follow_up_undone",
      "change_note_edited",
      "change_followed_up",
    ]);
    for (const e of list.slice(0, 3))
      expect(e).toMatchObject({
        actor: { id: "tm_ada", name: "Ada Bakare" },
        hospital: { id: "h_northgate", name: "Northgate General Hospital" },
        target: c.summary,
      });
    expect(list[1]!.detail).toBe("Asked the ward to check the pager rota.");
    // Activity filtered by the hospital finds them.
    const north = await m.listActivity({ hospital: "h_northgate" });
    expect(north.events[0]!.action).toBe("change_follow_up_undone");
  });

  it("Eastbrook has no admins; Hilltop, new, has no change", async () => {
    const { m } = setup();
    const h = await m.getHospital("h_eastbrook");
    expect(h.status).toBe("setup_incomplete");
    expect(h.admins).toEqual([]);
    expect(h.first_admin?.status).toBe("expired");
    // A hospital new this month has no previous month: no change (F17).
    expect(
      items(await m.getAnalytics("month")).some(byHospital("h_hilltop")),
    ).toBe(false);
    // Active hospitals list their active admins.
    const havana = await m.getHospital("h_havana");
    expect(havana).toMatchObject({
      name: "Havana Hospital",
      short_code: "HAVANA",
      status: "active",
      sso_enabled: false,
      email_domains: ["havanahospital.org"],
      first_admin: {
        name: "Grace Nwosu",
        email: "admin.nwosu@havanahospital.org",
        status: "accepted",
      },
      admins: [
        { name: "Grace Nwosu", email: "admin.nwosu@havanahospital.org" },
        { name: "Dr. Ngozi Obi", email: "director.obi@havanahospital.org" },
      ],
    });
    // A new hospital has nobody active yet.
    const added = await m.addHospital(
      {
        name: "Lakeside Community Hospital",
        short_code: "LCH",
        country: "NG",
        time_zone: "Africa/Lagos",
        email_domains: ["lakeside.example"],
        first_admin: { name: "Bola Ade", email: "bola.ade@lakeside.example" },
      },
      KEY(),
    );
    expect(added.admins).toEqual([]);
    for (const s of (await m.listHospitals({ status: "active" })).hospitals) {
      if (s.id === "h_hilltop") continue;
      const admins = (await m.getHospital(s.id)).admins;
      expect(admins.length).toBeGreaterThanOrEqual(1);
      expect(admins.length).toBeLessThanOrEqual(2);
    }
    // Hilltop is active, but its admin has left (R6).
    const hilltop = await m.getHospital("h_hilltop");
    expect(hilltop.status).toBe("active");
    expect(hilltop.admins).toEqual([]);
    expect(hilltop.first_admin?.status).toBe("accepted");
  });

  it("the series are successive periods, with the others' median", async () => {
    const { m } = setup();
    const north = await change(m, NGH);
    for (const [p, len] of [
      ["week", 12],
      ["month", 12],
      ["quarter", 8],
    ] as const) {
      const s = await m.getChangeSeries(north.id, p);
      expect(s.change_id).toBe(north.id);
      expect(s.measure).toBe("needs_review_share");
      expect(s.hospital?.id).toBe("h_northgate");
      expect(s.points).toHaveLength(len);
      expect(readSeries(s, s.measure, p, north.id).status).toBe("ok");
    }
    const all = await m.getChangeSeries("chg_all_questions", "month");
    expect(all.hospital).toBeNull();
    expect(all.points.every((pt) => pt.median === null)).toBe(true);
    const h = await m.getHospitalSeries(
      "h_riverside",
      "questions_per_clinician",
      "month",
    );
    expect(h.change_id).toBeUndefined();
    expect(h.points.every((pt) => typeof pt.median === "number")).toBe(true);
    expect(await failure(m.getChangeSeries("chg_nope", "month"))).toEqual([
      404,
      "not_found",
    ]);
    expect(
      await failure(
        m.getHospitalSeries("h_nope", "questions_per_clinician", "month"),
      ),
    ).toEqual([404, "not_found"]);
    // The Critical measures wait for alerts (F10); rolling windows are gone.
    for (const measure of ["critical_within_target", "questions"] as const)
      expect(
        await failure(m.getHospitalSeries("h_havana", measure, "month")),
      ).toEqual([422, "validation_failed"]);
    expect(await failure(m.getAnalytics("30d" as Period))).toEqual([
      422,
      "validation_failed",
    ]);
  });

  it("analytics cover active hospitals only", async () => {
    const { m } = setup();
    const active = [
      "h_havana",
      "h_northgate",
      "h_riverside",
      "h_lakeside",
      "h_hilltop",
    ];
    const a = await m.getAnalytics("month");
    for (const area of [a.use, a.quality, a.hospitals])
      expect(ok(area).rows.map((r) => r.hospital.id)).toEqual(active);
    for (const c of items(a))
      if (c.hospital) expect(active).toContain(c.hospital.id);
    for (const id of ["h_eastbrook", "h_westfield"])
      expect(
        await failure(
          m.getHospitalSeries(id, "questions_per_clinician", "month"),
        ),
      ).toEqual([404, "not_found"]);
  });

  it("'unavailable' makes every area unavailable; alerts stay null", async () => {
    const a = await setup("unavailable").m.getAnalytics("month");
    expect(a.period).toBe("month");
    for (const area of [
      a.changes,
      a.use,
      a.quality,
      a.hospitals,
      a.what_changed,
    ])
      expect(area).toEqual({ unavailable: true });
    expect(a.alerts).toBeNull();
  });

  it("'not_yet': no period published, each area says when (F19)", async () => {
    const { m } = setup("not_yet");
    const a = await m.getAnalytics("quarter");
    expect([a.from, a.to]).toEqual([null, null]);
    for (const area of [a.use, a.quality, a.hospitals])
      expect(area).toEqual({
        not_yet: true,
        first_from: "2027-01-01T00:00:00.000Z",
      });
    expect(a.what_changed).toEqual({ unavailable: true });
    expect(
      await failure(
        m.getHospitalSeries("h_havana", "questions_per_clinician", "month"),
      ),
    ).toEqual([404, "not_found"]);
    expect(await failure(m.getGuardrailPeriods("month"))).toEqual([
      503,
      "not_ready",
    ]);
  });

  it("guardrail statistics: the latest period, read strictly (F20)", async () => {
    const { m } = setup();
    for (const p of PERIODS) {
      const g = await m.getGuardrailPeriods(p);
      expect(readGuardrailPeriods(g, p)).toEqual(g);
      expect(g.hospitals.length).toBeGreaterThan(0);
      for (const [at, v] of guardedIn(g))
        if (v.value !== null && !at.endsWith("_share"))
          expect(v.value === 0 || v.value >= 5, `${p} ${at}`).toBe(true);
    }
  });

  it("reads need someone signed in", async () => {
    const { m } = setup(undefined, null);
    expect(await failure(m.getAnalytics("month"))).toEqual([
      401,
      "session_expired",
    ]);
  });
});
