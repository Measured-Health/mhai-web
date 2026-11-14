import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { readHold, readHolds } from "./admin-schema";
import { BlockedError } from "./contract";
import { TEAM_EMAILS } from "./fixtures";
import {
  keepsRecords,
  type LegalHold,
  type PlaceHoldIn,
} from "./holds-contract";
import { createMockPlatform } from "./mock";
import { MOCK_CODE, createStepUp } from "./step-up";

const START = Date.parse("2026-10-20T09:00:00.000Z");
const D = 24 * 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
let n = 0;
const KEY = () => ({ idempotencyKey: `h-${++n}` });
const CODE = { mfa_code: MOCK_CODE };
const WRONG = { mfa_code: "000000" };

function setup(
  email: string | null = TEAM_EMAILS.ada,
  removalStarted?: string[],
) {
  let t = START;
  let me = email;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    removalStarted,
  });
  return {
    m,
    as: (e: string | null) => void (me = e),
    advance: (ms: number) => void (t += ms),
  };
}

/** The hold's version as the person saw it, which lift actions send. */
const seen = async (m: ReturnType<typeof setup>["m"], id: string) => ({
  version: (await m.getHold(id)).version,
});

async function failure(p: Promise<unknown>): Promise<[number, string]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
  throw new Error("expected a refusal");
}

const PLACE: PlaceHoldIn = {
  hospital_id: "h_southpoint",
  reason: "court_case",
  reference: "HC-2026-0999",
  review_on: "2027-04-20",
  ...CODE,
};
/** A body with what core refuses, as an old client would send it. */
const loose = (extra: Record<string, unknown>) =>
  ({ ...PLACE, ...extra }) as unknown as PlaceHoldIn;

describe("mock legal holds (core openapi 1.26.0)", () => {
  it("open is the default filter: active, review due and lift requested", async () => {
    const { m } = setup();
    const open = await m.listHolds({});
    expect(open.holds.map((h) => [h.id, h.status])).toEqual([
      ["hold_hv", "active"],
      ["hold_rc", "lift_requested"],
      ["hold_ng", "review_due"],
      ["hold_rg", "review_due"],
    ]);
    expect(open.next_cursor).toBeNull();
    expect(open.holds[0]).not.toHaveProperty("history");
    expect(
      (await m.listHolds({ status: "all" })).holds.map((h) => h.id),
    ).toEqual([
      "hold_hv",
      "hold_rc",
      "hold_ng",
      "hold_hh",
      "hold_lc",
      "hold_rg",
    ]);
    expect(
      (await m.listHolds({ status: "lifted" })).holds.map((h) => h.id),
    ).toEqual(["hold_hh", "hold_lc"]);
    expect(
      (await m.listHolds({ status: "all", hospital: "h_lakeside" })).holds.map(
        (h) => h.id,
      ),
    ).toEqual(["hold_lc"]);
    expect(
      (await m.listHolds({ q: "cmp-2026" })).holds.map((h) => h.id),
    ).toEqual(["hold_rc"]);
    expect(await failure(m.listHolds({ status: "gone" as "all" }))).toEqual([
      422,
      "invalid",
    ]);
    expect(await failure(m.getHold("hold_nope"))).toEqual([404, "not_found"]);
  });

  it("every sample hold reads through core's strict schema: all records, no note, no name", async () => {
    const { m } = setup();
    const all = await m.listHolds({ status: "all" });
    expect(() => readHolds(all)).not.toThrow();
    for (const h of all.holds) {
      expect(h.scope).toEqual({ from: null, to: null });
      expect(h.note).toBeNull();
      expect(h.asked_by).toBeNull();
      expect(readHold(await m.getHold(h.id)).id).toBe(h.id);
    }
    const rc = await m.getHold("hold_rc");
    expect(rc.lift).toMatchObject({
      kind: "hold_lift",
      requested_by: { id: "tm_tunde" },
      authority: "CT-2026-0091",
      note: null,
      records_due: null,
      due_after: null,
      expires_at: iso(START - 2 * D + 7 * D),
    });
    // Lifted at once: released when approved, and no "released" event.
    const hh = await m.getHold("hold_hh");
    expect(hh.lift?.released_on).toBe(hh.lift?.approved_at);
    expect(hh.history.map((e) => e.action)).toEqual([
      "lifted",
      "lift_requested",
      "placed",
    ]);
  });

  it("the command line's hold has no reason and is placed by `cli`", async () => {
    const { m } = setup();
    const rg = await m.getHold("hold_rg");
    expect(rg).toMatchObject({
      reason: null,
      placed_by: { id: "cli", name: "Provisioning command line" },
      status: "review_due",
    });
  });

  it("keepsRecords: every hold but a lifted one (no grace period)", async () => {
    for (const status of ["active", "review_due", "lift_requested"] as const)
      expect(keepsRecords({ status } as LegalHold)).toBe(true);
    expect(keepsRecords({ status: "lifted" } as LegalHold)).toBe(false);
    const { m } = setup();
    expect((await m.getHospital("h_lakeside")).legal_holds_active).toBe(0);
  });

  it("placing on Southpoint blocks its removal with legal_holds 1", async () => {
    const { m, as } = setup();
    expect((await m.getHospital("h_southpoint")).removal).toMatchObject({
      blocking: [],
      checks: { legal_holds: 0 },
    });
    const h = await m.placeHold(PLACE, KEY());
    expect(h).toMatchObject({
      hospital: { id: "h_southpoint", name: "Southpoint Hospital" },
      scope: { from: null, to: null },
      reason: "court_case",
      reference: "HC-2026-0999",
      asked_by: null,
      note: null,
      placed_by: { id: "tm_ada", name: "Ada Bakare" },
      placed_at: iso(START),
      review_on: "2027-04-20",
      status: "active",
      lift: null,
      stopped_removal: false,
      version: 1,
    });
    expect(() => readHold(h)).not.toThrow();
    expect(h.history.map((e) => e.action)).toEqual(["placed"]);
    const sp = await m.getHospital("h_southpoint");
    expect(sp.removal).toMatchObject({
      blocking: ["legal_hold"],
      checks: { legal_holds: 1 },
    });
    const e = await m
      .approveRemoval("h_southpoint", CODE, KEY())
      .catch((x) => x);
    expect(e).toBeInstanceOf(BlockedError);
    as(TEAM_EMAILS.tunde);
    expect(
      (await m.listHolds({ hospital: "h_southpoint" })).holds,
    ).toHaveLength(1);
  });

  it("placing on a scheduled removal returns it to Removal pending and sets stopped_removal", async () => {
    const { m, advance } = setup();
    expect((await m.approveRemoval("h_southpoint", CODE, KEY())).status).toBe(
      "removal_scheduled",
    );
    advance(30_000);
    const h = await m.placeHold(PLACE, KEY());
    expect(h.stopped_removal).toBe(true);
    expect((await m.getHospital("h_southpoint")).status).toBe(
      "removal_pending",
    );
  });

  it("removalStarted and a removed hospital refuse; an unknown one is 404", async () => {
    const started = setup(TEAM_EMAILS.ada, ["h_southpoint"]);
    expect(await failure(started.m.placeHold(PLACE, KEY()))).toEqual([
      409,
      "removal_started",
    ]);
    const { m, advance } = setup();
    await m.approveRemoval("h_southpoint", CODE, KEY());
    advance(61_000);
    expect(await failure(m.placeHold(PLACE, KEY()))).toEqual([
      409,
      "hospital_removed",
    ]);
    expect(
      await failure(m.placeHold({ ...PLACE, hospital_id: "h_nope" }, KEY())),
    ).toEqual([404, "not_found"]);
  });

  it("a hold keeps every record: from or to is invalid_range", async () => {
    const { m } = setup();
    for (const extra of [
      { from: "2025-01-01" },
      { to: "2025-06-30" },
      { from: "2025-01-01", to: "2025-06-30" },
    ])
      expect(await failure(m.placeHold(loose(extra), KEY()))).toEqual([
        422,
        "invalid_range",
      ]);
    // Null dates are the same as none.
    expect(
      (await m.placeHold(loose({ from: null, to: null }), KEY())).scope,
    ).toEqual({ from: null, to: null });
  });

  it("no free text and no names: a note or asked_by is refused; null or empty passes", async () => {
    const { m } = setup();
    for (const extra of [
      { note: "Call first." },
      { asked_by: "The hospital's solicitors" },
    ])
      expect(await failure(m.placeHold(loose(extra), KEY()))).toEqual([
        422,
        "invalid",
      ]);
    const h = await m.placeHold(loose({ note: "", asked_by: null }), KEY());
    expect(h).toMatchObject({ note: null, asked_by: null });
  });

  it("the reference is a document reference, and the review date within 5 years", async () => {
    const { m } = setup();
    for (const extra of [
      { reference: "HC/2026/0412" },
      { reference: "Board request" },
      { reason: "sometime" },
      { review_on: "next spring" },
      { review_on: "2026-10-20" },
      { review_on: "2031-10-21" },
    ])
      expect(await failure(m.placeHold(loose(extra), KEY()))).toEqual([
        422,
        "invalid",
      ]);
    expect(
      (await m.placeHold(loose({ review_on: "2031-10-20" }), KEY())).review_on,
    ).toBe("2031-10-20");
  });

  it("an open hold with the same reference is conflict, before the code", async () => {
    const { m } = setup();
    expect(
      await failure(
        m.placeHold(
          {
            ...PLACE,
            hospital_id: "h_havana",
            reference: "HC-2026-0412",
            ...WRONG,
          },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    // A lifted hold's reference can be used again.
    expect(
      (
        await m.placeHold(
          { ...PLACE, hospital_id: "h_havana", reference: "BRD-2026-03" },
          KEY(),
        )
      ).reference,
    ).toBe("BRD-2026-03");
  });

  it("editing a hold and undoing a lift are not served (501), for an admin", async () => {
    const { m } = setup();
    expect(
      await failure(
        m.editHold("hold_hv", { review_on: "2027-06-01", version: 1 }, KEY()),
      ),
    ).toEqual([501, "not_implemented"]);
    expect(
      await failure(m.undoLift("hold_lc", { version: 3, ...CODE }, KEY())),
    ).toEqual([501, "not_implemented"]);
    // Nothing changed.
    expect((await m.getHold("hold_hv")).review_on).not.toBe("2027-06-01");
  });

  it("a lift's authority is a document reference, with no note", async () => {
    const { m } = setup();
    for (const body of [
      { reason: "case_closed", authority: "Counsel's letter 14 Oct 2026" },
      { reason: "case_closed", authority: "CT-2026-0091", note: "Settled." },
      { reason: "sometime", authority: "CT-2026-0091" },
    ])
      expect(
        await failure(
          m.requestLift(
            "hold_hv",
            { ...body, ...CODE } as Parameters<typeof m.requestLift>[1],
            KEY(),
          ),
        ),
      ).toEqual([422, "invalid"]);
    expect((await m.getHold("hold_hv")).status).toBe("active");
  });

  it("approve lifts at once: released_on is the approval, and nothing is kept", async () => {
    const { m, as, advance } = setup(TEAM_EMAILS.tunde);
    const asked = await m.requestLift(
      "hold_hv",
      { reason: "case_closed", authority: "CT-2026-0101", ...CODE },
      KEY(),
    );
    expect(asked).toMatchObject({
      status: "lift_requested",
      lift: {
        reason: "case_closed",
        authority: "CT-2026-0101",
        note: null,
        requested_by: { id: "tm_tunde" },
        requested_by_you: true,
        requested_at: iso(START),
        expires_at: iso(START + 7 * D),
        records_due: null,
        due_after: null,
        approved_by: null,
        released_on: null,
      },
    });
    expect(() => readHold(asked)).not.toThrow();
    expect(
      await failure(
        m.requestLift(
          "hold_hv",
          { reason: "case_closed", authority: "CT-2026-0102", ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    // Still keeps its records while the request waits.
    expect((await m.getHospital("h_harbour")).removal?.blocking).toEqual([
      "legal_hold",
    ]);

    as(TEAM_EMAILS.ada);
    advance(D);
    const lifted = await m.approveLift(
      "hold_hv",
      { version: asked.version, ...CODE },
      KEY(),
    );
    expect(lifted).toMatchObject({
      status: "lifted",
      lift: {
        approved_by: { id: "tm_ada" },
        approved_at: iso(START + D),
        released_on: iso(START + D),
      },
    });
    expect(() => readHold(lifted)).not.toThrow();
    const hv = await m.getHospital("h_harbour");
    expect(hv.legal_holds_active).toBe(0);
    expect(hv.removal?.blocking).toEqual([]);
  });

  it("approve and cancel act only on the version seen", async () => {
    const { m, as } = setup();
    const saw = await seen(m, "hold_rc");
    as(TEAM_EMAILS.tunde);
    await m.cancelLift("hold_rc", saw, KEY());
    const again = await m.requestLift(
      "hold_rc",
      { reason: "withdrawn", authority: "ML-2026-0020", ...CODE },
      KEY(),
    );
    as(TEAM_EMAILS.ada);
    expect(
      await failure(m.approveLift("hold_rc", { ...saw, ...CODE }, KEY())),
    ).toEqual([409, "conflict"]);
    expect(await failure(m.cancelLift("hold_rc", saw, KEY()))).toEqual([
      409,
      "conflict",
    ]);
    expect(
      (
        await m.approveLift(
          "hold_rc",
          { version: again.version, ...CODE },
          KEY(),
        )
      ).status,
    ).toBe("lifted");
  });

  it("an auditor can't place, edit or lift", async () => {
    const { m } = setup(TEAM_EMAILS.amara);
    expect((await m.listHolds({})).holds).toHaveLength(4);
    const refusals = [
      () => m.placeHold(PLACE, KEY()),
      () =>
        m.editHold("hold_hv", { review_on: "2027-06-01", version: 1 }, KEY()),
      () =>
        m.requestLift(
          "hold_hv",
          { reason: "case_closed", authority: "CT-2026-0091", ...CODE },
          KEY(),
        ),
      () => m.approveLift("hold_rc", { version: 2, ...CODE }, KEY()),
      () => m.cancelLift("hold_rc", { version: 2 }, KEY()),
      () => m.undoLift("hold_lc", { version: 3, ...CODE }, KEY()),
    ];
    for (const run of refusals)
      expect(await failure(run())).toEqual([403, "forbidden"]);
    expect((await m.getHold("hold_rc")).status).toBe("lift_requested");
  });

  it("every step-up action refuses a wrong code with mfa_invalid", async () => {
    const { m } = setup();
    expect(await failure(m.placeHold({ ...PLACE, ...WRONG }, KEY()))).toEqual([
      403,
      "mfa_invalid",
    ]);
    expect(
      await failure(
        m.requestLift(
          "hold_hv",
          { reason: "case_closed", authority: "CT-2026-0091", ...WRONG },
          KEY(),
        ),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect(
      await failure(
        m.approveLift(
          "hold_rc",
          { ...(await seen(m, "hold_rc")), ...WRONG },
          KEY(),
        ),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect(
      (await m.listHolds({ status: "all" })).holds.map((h) => h.status),
    ).toEqual([
      "active",
      "lift_requested",
      "review_due",
      "lifted",
      "lifted",
      "review_due",
    ]);
  });

  it("the requester's approval is same_person; either admin may cancel", async () => {
    const { m, as } = setup(TEAM_EMAILS.tunde);
    expect((await m.getHold("hold_rc")).lift?.requested_by_you).toBe(true);
    const v = await seen(m, "hold_rc");
    expect(
      await failure(m.approveLift("hold_rc", { ...v, ...CODE }, KEY())),
    ).toEqual([409, "same_person"]);
    as(TEAM_EMAILS.ada);
    expect((await m.getHold("hold_rc")).lift?.requested_by_you).toBe(false);
    const c = await m.cancelLift("hold_rc", v, KEY());
    expect(c).toMatchObject({ status: "active", lift: null });
    expect(c.history[0]).toMatchObject({
      action: "lift_cancelled",
      actor: { id: "tm_ada" },
    });
  });

  it("a lapsed request: approval is expired; no history line and no Activity (no person did it)", async () => {
    const { m, advance } = setup();
    const v = await seen(m, "hold_rc");
    advance(5 * D);
    expect(
      await failure(m.approveLift("hold_rc", { ...v, ...CODE }, KEY())),
    ).toEqual([409, "expired"]);
    const rc = await m.getHold("hold_rc");
    expect(rc).toMatchObject({ status: "active", lift: null });
    expect(rc.history.map((e) => e.action)).toEqual([
      "lift_requested",
      "placed",
    ]);
    expect(
      (await m.listActivity({})).events.some((e) =>
        e.action.includes("lapsed"),
      ),
    ).toBe(false);
    expect(
      await failure(
        m.approveLift("hold_rc", { version: rc.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "expired"]);
    // A new request starts afresh.
    const again = await m.requestLift(
      "hold_rc",
      { reason: "case_closed", authority: "CT-2026-0091", ...CODE },
      KEY(),
    );
    expect(again.status).toBe("lift_requested");
  });

  it("Activity carries the reference and the reason's words", async () => {
    const { m, as } = setup();
    const h = await m.placeHold(PLACE, KEY());
    as(TEAM_EMAILS.tunde);
    await m.requestLift(
      h.id,
      { reason: "other", authority: "CT-2026-0091", ...CODE },
      KEY(),
    );
    as(TEAM_EMAILS.ada);
    await m.approveLift(h.id, { ...(await seen(m, h.id)), ...CODE }, KEY());
    const events = (await m.listActivity({ hospital: "h_southpoint" })).events;
    const mine = events.filter((e) => e.action.startsWith("hold_"));
    expect(mine.map((e) => [e.action, e.target, e.detail])).toEqual([
      ["hold_lifted", "HC-2026-0999", "Other"],
      ["hold_lift_requested", "HC-2026-0999", "Other"],
      ["hold_placed", "HC-2026-0999", "Court case"],
    ]);
    // Every event has a person behind it.
    for (const e of events) expect(e.actor.id).toMatch(/^tm_/);
  });

  it("hospitals carry legal_holds_active and legal_holds", async () => {
    const { m } = setup();
    const list = await m.listHospitals({});
    expect(
      Object.fromEntries(
        list.hospitals.map((h) => [h.id, h.legal_holds_active]),
      ),
    ).toEqual({
      h_havana: 0,
      h_northgate: 1,
      h_riverside: 1,
      h_eastbrook: 0,
      h_westfield: 0,
      h_harbour: 1,
      h_southpoint: 0,
      h_lakeside: 0,
      h_hilltop: 0,
      h_ridgeway: 1,
      h_marlow: 0,
      h_fairhaven: 0,
    });
    const hv = await m.getHospital("h_harbour");
    expect(hv.legal_holds).toEqual([
      {
        id: "hold_hv",
        scope: { from: null, to: null },
        reference: "HC-2026-0412",
        status: "active",
        review_on: (await m.getHold("hold_hv")).review_on,
      },
    ]);
    expect(hv.removal?.checks.legal_holds).toBe(1);
    // A lift request is still active in short form.
    expect((await m.getHospital("h_riverside")).legal_holds[0]?.status).toBe(
      "active",
    );
    expect((await m.getHospital("h_havana")).legal_holds).toEqual([]);
  });
});
