import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import type {
  AlertsRow,
  AnalyticsOut,
  Change,
  Guarded,
  Period,
  QualityRow,
  UseRow,
} from "./analytics-contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";

const START = Date.parse("2026-10-22T09:30:00.000Z");
let n = 0;
const KEY = () => ({ idempotencyKey: `ka-${++n}` });
const PERIODS: Period[] = ["7d", "30d", "90d"];

function setup(
  analytics?: "normal" | "guard" | "unavailable",
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

type Ok<T> = Exclude<T, { unavailable: true }>;
function ok<T>(v: T): Ok<T> {
  if (v && typeof v === "object" && "unavailable" in v)
    throw new Error("area unavailable");
  return v as Ok<T>;
}
const items = (a: AnalyticsOut) => ok(a.changes).items;
const change = async (
  m: ReturnType<typeof setup>["m"],
  pick: (c: Change) => boolean,
) => {
  const c = items(await m.getAnalytics("30d")).find(pick);
  if (!c) throw new Error("no such change");
  return c;
};
const byHospital = (id: string | null) => (c: Change) =>
  (c.hospital?.id ?? null) === id;

/** Every Guarded value anywhere in a reply, with where it sits. */
function guardedIn(v: unknown, at = "$"): [string, Guarded][] {
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  if ("suppressed" in o && "value" in o && Object.keys(o).length === 2)
    return [[at, o as Guarded]];
  return Object.entries(o).flatMap(([k, x]) => guardedIn(x, `${at}.${k}`));
}

const COUNTS_USE = ["questions", "active_clinicians"] as const;
function countsOf(a: AnalyticsOut): [string, Guarded][] {
  const out: [string, Guarded][] = [];
  const use = ok(a.use);
  const alerts = ok(a.alerts);
  const quality = ok(a.quality);
  const rows = <R extends { hospital: { id: string } }>(b: {
    rows: R[];
    median: Omit<R, "hospital">;
  }) => [...b.rows, { hospital: { id: "median" }, ...b.median } as R];
  for (const r of rows<UseRow>(use))
    for (const k of COUNTS_USE) out.push([`use.${r.hospital.id}.${k}`, r[k]]);
  for (const r of rows<AlertsRow>(alerts)) {
    for (const [k, g] of Object.entries(r.by_severity))
      out.push([`alerts.${r.hospital.id}.${k}`, g]);
    out.push([`alerts.${r.hospital.id}.total`, r.total]);
    out.push([`alerts.${r.hospital.id}.unhandled`, r.unhandled]);
    out.push([`alerts.${r.hospital.id}.overdue`, r.critical_overdue]);
  }
  for (const r of rows<QualityRow>(quality)) {
    out.push([`quality.${r.hospital.id}.answers`, r.answers]);
    out.push([`quality.${r.hospital.id}.reviews`, r.reviews]);
    for (const [k, g] of Object.entries(r.confidence))
      out.push([`quality.${r.hospital.id}.${k}`, g]);
  }
  for (const area of [use, alerts] as const)
    area.trend.forEach((p, i) => out.push([`trend.${i}`, p.value]));
  for (const r of ok(a.hospitals).rows) {
    out.push([`size.${r.hospital.id}.clin`, r.size.active_clinicians]);
    out.push([`size.${r.hospital.id}.q`, r.size.questions]);
  }
  return out;
}

describe("mock analytics", () => {
  it("changes are the same for every period and keep their ids", async () => {
    const { m } = setup();
    const lists = await Promise.all(PERIODS.map((p) => m.getAnalytics(p)));
    const first = ok(lists[0]!.changes);
    expect(first.items.length).toBeGreaterThan(5);
    for (const a of lists) expect(ok(a.changes)).toEqual(first);
    for (const c of first.items) expect(c.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(new Set(first.items.map((c) => c.id)).size).toBe(first.items.length);
    // The fixed window: the last 7 whole UTC days, whatever the period.
    expect(first.window).toEqual({
      from: "2026-10-15T00:00:00.000Z",
      to: "2026-10-22T00:00:00.000Z",
    });
    // The period itself moves the charts and tabs.
    expect(lists.map((a) => a.period)).toEqual(PERIODS);
    expect(lists.map((a) => a.from)).toEqual([
      "2026-10-15T00:00:00.000Z",
      "2026-09-22T00:00:00.000Z",
      "2026-07-24T00:00:00.000Z",
    ]);
    expect(ok(lists[0]!.use).trend).toHaveLength(7);
    expect(ok(lists[1]!.use).trend).toHaveLength(30);
    expect(ok(lists[2]!.use).trend).toHaveLength(13);
    // A second client sees the same ids.
    const again = await setup().m.getAnalytics("90d");
    expect(items(again).map((c) => c.id)).toEqual(first.items.map((c) => c.id));
  });

  it("the fixtures cover every rule", async () => {
    const { m } = setup();
    const a = await m.getAnalytics("30d");
    const list = items(a);
    const north = list.find(
      (c) => c.hospital?.id === "h_northgate" && c.serious,
    )!;
    expect(north).toMatchObject({
      area: "alerts",
      measure: "critical_median_ack_minutes",
      direction: "worse",
      previous: { value: 18, suppressed: false },
      current: { value: 36, suppressed: false },
    });
    expect(north.summary).toMatch(/2× slower/);
    const river = list.find(byHospital("h_riverside"))!;
    expect(river).toMatchObject({ measure: "questions", direction: "falling" });
    expect(river.summary).toMatch(/41%/);
    expect(river.follow_up).toMatchObject({
      by: { id: "tm_tunde", name: "Tunde Okafor" },
      version: 1,
    });
    expect(river.follow_up!.note).toBeTruthy();
    const all = list.find(byHospital(null))!;
    expect(all).toMatchObject({ area: "alerts", direction: "rising" });
    expect(all.summary).toMatch(/Low potassium/);
    // Havana, the clinical demo's hospital, is in every area.
    for (const area of [a.use, a.alerts, a.quality, a.hospitals])
      expect(ok(area).rows[0]!.hospital).toEqual({
        id: "h_havana",
        name: "Havana Hospital",
      });
    // Normal mode: no hospital is overdue without a serious change for it.
    for (const r of ok(a.alerts).rows) {
      const g = r.critical_overdue;
      if (g.suppressed || (g.value ?? 0) > 0)
        expect(
          list.some((c) => c.serious && c.hospital?.id === r.hospital.id),
        ).toBe(true);
    }
  });

  it("counts 1–4 are suppressed, 0 is not", async () => {
    const { m } = setup();
    for (const p of PERIODS) {
      const a = await m.getAnalytics(p);
      for (const [at, g] of countsOf(a)) {
        if (g.value !== null)
          expect(g.value === 0 || g.value >= 5, `${p} ${at}`).toBe(true);
        if (g.suppressed) expect(g.value, `${p} ${at}`).toBeNull();
      }
      for (const [at, g] of guardedIn(a))
        if (g.suppressed) expect(g.value, `${p} ${at}`).toBeNull();
    }
    const a = await m.getAnalytics("30d");
    const use = ok(a.use);
    const row = (id: string) => use.rows.find((r) => r.hospital.id === id)!;
    // The small hospital: 1–4 are hidden, and so is any rate over them.
    const small = row("h_lakeside");
    expect(small.questions).toEqual({ value: null, suppressed: true });
    expect(small.questions_per_clinician).toEqual({
      value: null,
      suppressed: true,
    });
    // The hospital with zeros shows them.
    const zero = row("h_hilltop");
    expect(zero.questions).toEqual({ value: 0, suppressed: false });
    expect(zero.active_clinicians).toEqual({ value: 0, suppressed: false });
    expect(zero.questions_per_clinician.suppressed).toBe(false);
  });

  it("never sends a rate, median or share over a hidden count", async () => {
    const { m } = setup("guard");
    for (const p of PERIODS) {
      const a = await m.getAnalytics(p);
      const use = ok(a.use);
      for (const r of [...use.rows, use.median as UseRow])
        if (r.questions.suppressed || r.active_clinicians.suppressed)
          expect(r.questions_per_clinician.suppressed).toBe(true);
      const alerts = ok(a.alerts);
      for (const r of [...alerts.rows, alerts.median as AlertsRow]) {
        const sev = Object.values(r.by_severity);
        // A set with a hidden member hides the whole set.
        if (sev.some((g) => g.suppressed))
          expect(sev.every((g) => g.suppressed)).toBe(true);
        if (r.total.suppressed)
          expect(r.median_ack_minutes.suppressed).toBe(true);
        if (r.by_severity.critical.suppressed) {
          expect(r.critical_median_ack_minutes.suppressed).toBe(true);
          expect(r.critical_within_target.suppressed).toBe(true);
        }
      }
      const quality = ok(a.quality);
      for (const r of [...quality.rows, quality.median as QualityRow]) {
        const mix = Object.values(r.confidence);
        if (mix.some((g) => g.suppressed))
          expect(mix.every((g) => g.suppressed)).toBe(true);
        if (r.answers.suppressed)
          expect(r.needs_review_share.suppressed).toBe(true);
      }
    }
  });

  it("an auditor can't follow up", async () => {
    const { m, as } = setup();
    const c = await change(m, byHospital("h_northgate"));
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
    const c = await change(m, (x) => x.serious);
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
    const c = await change(m, (x) => x.serious);
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

  it("a note over 500 characters is 422", async () => {
    const { m } = setup();
    const c = await change(m, (x) => x.serious);
    expect(
      await failure(
        m.followUp(c.id, { note: "x".repeat(501), version: c.version }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    const fine = await m.followUp(
      c.id,
      { note: ` ${"x".repeat(500)} `, version: c.version },
      KEY(),
    );
    expect(fine.follow_up?.note).toBe("x".repeat(500));
    // A blank note is no note.
    const blank = await m.followUp(
      c.id,
      { note: "  ", version: fine.version },
      KEY(),
    );
    expect(blank.follow_up?.note).toBeNull();
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
    const c = await change(m, (x) => x.serious);
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

  it("Eastbrook has no admins; Hilltop has no previous period", async () => {
    const { m } = setup();
    const h = await m.getHospital("h_eastbrook");
    expect(h.status).toBe("setup_incomplete");
    expect(h.admins).toEqual([]);
    expect(h.first_admin?.status).toBe("expired");
    // A hospital new this month (active, R4): nothing earlier to compare.
    const hill = await change(m, byHospital("h_hilltop"));
    expect(hill.previous).toEqual({ value: null, suppressed: false });
    expect(hill.current.suppressed).toBe(false);
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

  it("the series follow the change and the hospital, with the others' median", async () => {
    const { m } = setup();
    const north = await change(m, (x) => x.serious);
    for (const [p, len] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 13],
    ] as const) {
      const s = await m.getChangeSeries(north.id, p);
      expect(s.measure).toBe("critical_median_ack_minutes");
      expect(s.hospital).toEqual({
        id: "h_northgate",
        name: "Northgate General Hospital",
      });
      expect(s.points).toHaveLength(len);
    }
    const h = await m.getHospitalSeries(
      "h_riverside",
      "questions_per_clinician",
      "30d",
    );
    expect(h.hospital.id).toBe("h_riverside");
    expect(h.points.every((pt) => typeof pt.median === "number")).toBe(true);
    const small = await m.getHospitalSeries("h_lakeside", "questions", "7d");
    for (const pt of small.points)
      if (pt.value.value !== null) expect(pt.value.value).toBe(0);
    // A count median between 0 and 5 (4.5 too) is sent hidden.
    for (const id of ["h_lakeside", "h_hilltop", "h_havana", "h_riverside"])
      for (const measure of [
        "questions",
        "active_clinicians",
        "alerts_total",
        "unhandled_alerts",
      ] as const)
        for (const pt of (await m.getHospitalSeries(id, measure, "30d")).points)
          if (pt.median !== null)
            expect(pt.median === 0 || pt.median >= 5).toBe(true);
    expect(await failure(m.getChangeSeries("chg_nope", "30d"))).toEqual([
      404,
      "not_found",
    ]);
    expect(
      await failure(m.getHospitalSeries("h_nope", "questions", "30d")),
    ).toEqual([404, "not_found"]);
    expect(
      await failure(
        m.getHospitalSeries("h_havana", "nope" as "questions", "30d"),
      ),
    ).toEqual([422, "invalid"]);
    expect(await failure(m.getAnalytics("365d" as Period))).toEqual([
      422,
      "invalid",
    ]);
  });

  it("the 'guard' option drops Northgate's serious change and keeps its overdue", async () => {
    const overdue = (a: AnalyticsOut) =>
      ok(a.alerts).rows.find((r) => r.hospital.id === "h_northgate")!
        .critical_overdue;
    const guard = await setup("guard").m.getAnalytics("30d");
    expect(items(guard).some((c) => c.serious)).toBe(false);
    expect(overdue(guard)).toEqual({ value: null, suppressed: true });
    // Normal: the same overdue, covered by Northgate's serious change.
    const normal = await setup().m.getAnalytics("30d");
    expect(overdue(normal)).toEqual({ value: null, suppressed: true });
    expect(
      items(normal).some((c) => c.serious && c.hospital?.id === "h_northgate"),
    ).toBe(true);
  });

  it("analytics cover active hospitals only", async () => {
    const { m } = setup();
    // The three hospitals only Analysis has (Plan 12) have no usage sample.
    const active = (await m.listHospitals({ status: "active" })).hospitals
      .map((h) => h.id)
      .filter((id) => !["h_ridgeway", "h_marlow", "h_fairhaven"].includes(id));
    expect(active).toEqual([
      "h_havana",
      "h_northgate",
      "h_riverside",
      "h_lakeside",
      "h_hilltop",
    ]);
    for (const mode of ["normal", "guard"] as const)
      for (const p of PERIODS) {
        const a = await setup(mode).m.getAnalytics(p);
        for (const area of [a.use, a.alerts, a.quality, a.hospitals])
          expect(ok(area).rows.map((r) => r.hospital.id)).toEqual(active);
        for (const c of items(a))
          if (c.hospital) expect(active).toContain(c.hospital.id);
      }
    for (const id of [
      "h_eastbrook",
      "h_westfield",
      "h_harbour",
      "h_southpoint",
    ])
      expect(
        await failure(m.getHospitalSeries(id, "questions", "30d")),
      ).toEqual([404, "not_found"]);
  });

  it("the 'unavailable' option makes every area unavailable", async () => {
    const { m } = setup("unavailable");
    const a = await m.getAnalytics("30d");
    expect(a.period).toBe("30d");
    for (const area of [a.changes, a.use, a.alerts, a.quality, a.hospitals])
      expect(area).toEqual({ unavailable: true });
  });

  it("reads need someone signed in", async () => {
    const { m } = setup(undefined, null);
    expect(await failure(m.getAnalytics("30d"))).toEqual([
      401,
      "session_expired",
    ]);
  });
});
