import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { BlockedError } from "./contract";
import { TEAM_EMAILS } from "./fixtures";
import {
  keepsRecords,
  type LegalHold,
  type PlaceHoldIn,
} from "./holds-contract";
import { nextCleanUp } from "./holds-fixtures";
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
  reference: "HC/2026/0999",
  asked_by: "The hospital's solicitors",
  review_on: "2027-04-20",
  ...CODE,
};

describe("mock legal holds", () => {
  it("open is the default filter: active, review due and lift requested", async () => {
    const { m } = setup();
    const open = await m.listHolds({});
    expect(open.holds.map((h) => [h.id, h.status])).toEqual([
      ["hold_hv", "active"],
      ["hold_rc", "lift_requested"],
      ["hold_ng", "review_due"],
    ]);
    expect(open.next_cursor).toBeNull();
    expect(open.holds[0]).not.toHaveProperty("history");
    expect(
      (await m.listHolds({ status: "all" })).holds.map((h) => h.id),
    ).toEqual(["hold_hv", "hold_rc", "hold_ng", "hold_hh", "hold_lc"]);
    expect(
      (await m.listHolds({ status: "lifted" })).holds.map((h) => h.id),
    ).toEqual(["hold_hh", "hold_lc"]);
    expect(
      (await m.listHolds({ status: "all", hospital: "h_lakeside" })).holds.map(
        (h) => h.id,
      ),
    ).toEqual(["hold_lc"]);
    expect((await m.listHolds({ q: "cmp-01" })).holds.map((h) => h.id)).toEqual(
      ["hold_rc"],
    );
    expect(await failure(m.listHolds({ status: "gone" as "all" }))).toEqual([
      422,
      "invalid",
    ]);

    const rc = await m.getHold("hold_rc");
    expect(rc).toMatchObject({
      hospital: { id: "h_riverside" },
      reference: "CMP-0193",
      lift: {
        kind: "hold_lift",
        requested_by: { id: "tm_tunde" },
        authority: "Counsel's letter 14 Oct 2026, ref ABC-123",
        records_due: 1240,
        expires_at: iso(START - 2 * D + 7 * D),
      },
    });
    expect(rc.history.map((e) => e.action)).toEqual([
      "lift_requested",
      "placed",
    ]);
    const hh = await m.getHold("hold_hh");
    expect(hh.note).toBe("Board request pending legal review");
    expect(hh.lift?.approved_by).toEqual({ id: "tm_ada", name: "Ada Bakare" });
    expect(hh.history[0]?.action).toBe("released");
    expect(await failure(m.getHold("hold_nope"))).toEqual([404, "not_found"]);
  });

  it("keepsRecords counts lifted holds until released_on", async () => {
    const lifted = (released_on: string | null) =>
      ({ status: "lifted", lift: { released_on } }) as LegalHold;
    expect(keepsRecords(lifted(iso(START + 1)), START)).toBe(true);
    expect(keepsRecords(lifted(iso(START)), START)).toBe(false);
    expect(keepsRecords(lifted(null), START)).toBe(false);
    for (const status of ["active", "review_due", "lift_requested"] as const)
      expect(keepsRecords({ status, lift: null } as LegalHold, START)).toBe(
        true,
      );

    const { m, advance } = setup();
    expect((await m.getHospital("h_lakeside")).legal_holds_active).toBe(1);
    advance(4 * D);
    expect((await m.getHospital("h_lakeside")).legal_holds_active).toBe(0);
  });

  it("placing on Southpoint blocks its removal with legal_holds 1", async () => {
    const { m, as } = setup();
    expect((await m.getHospital("h_southpoint")).removal).toMatchObject({
      blocking: [],
      checks: { legal_holds: 0 },
    });
    const h = await m.placeHold({ ...PLACE, note: "Call first." }, KEY());
    expect(h).toMatchObject({
      hospital: { id: "h_southpoint", name: "Southpoint Hospital" },
      scope: { from: null, to: null },
      reason: "court_case",
      reference: "HC/2026/0999",
      note: "Call first.",
      placed_by: { id: "tm_ada", name: "Ada Bakare" },
      placed_at: iso(START),
      review_on: "2027-04-20",
      status: "active",
      lift: null,
      stopped_removal: false,
      version: 1,
    });
    expect(h.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(h.history.map((e) => e.action)).toEqual(["placed"]);
    const sp = await m.getHospital("h_southpoint");
    expect(sp.status).toBe("removal_pending");
    expect(sp.removal).toMatchObject({
      blocking: ["legal_hold"],
      checks: { legal_holds: 1 },
    });
    // Ada didn't ask for the removal, but the hold now blocks her approval.
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
    // Tunde asked; Ada approves: the removal is final a minute later.
    expect((await m.approveRemoval("h_southpoint", CODE, KEY())).status).toBe(
      "removal_scheduled",
    );
    advance(30_000);
    const h = await m.placeHold(PLACE, KEY());
    expect(h.stopped_removal).toBe(true);
    const sp = await m.getHospital("h_southpoint");
    expect(sp.status).toBe("removal_pending");
    expect(sp.removal).toMatchObject({
      status: "requested",
      requested_by: { id: "tm_tunde" },
      approved_by: null,
      approved_at: null,
      blocking: ["legal_hold"],
      checks: { legal_holds: 1 },
    });
    advance(120_000);
    expect((await m.getHospital("h_southpoint")).status).toBe(
      "removal_pending",
    );
  });

  it("removalStarted refuses with removal_started", async () => {
    const { m } = setup(TEAM_EMAILS.ada, ["h_southpoint"]);
    expect(await failure(m.placeHold(PLACE, KEY()))).toEqual([
      409,
      "removal_started",
    ]);
    expect((await m.listHolds({ hospital: "h_southpoint" })).holds).toEqual([]);
    expect(
      (await m.placeHold({ ...PLACE, hospital_id: "h_havana" }, KEY())).hospital
        .id,
    ).toBe("h_havana");
  });

  it("placing on a removed hospital is hospital_removed", async () => {
    const { m, advance } = setup();
    await m.approveRemoval("h_southpoint", CODE, KEY());
    advance(61_000);
    expect((await m.getHospital("h_southpoint")).status).toBe("removed");
    expect(await failure(m.placeHold(PLACE, KEY()))).toEqual([
      409,
      "hospital_removed",
    ]);
    expect(
      await failure(m.placeHold({ ...PLACE, hospital_id: "h_nope" }, KEY())),
    ).toEqual([404, "not_found"]);
  });

  it("to before from is invalid_range", async () => {
    const { m } = setup();
    expect(
      await failure(
        m.placeHold({ ...PLACE, from: "2025-06-30", to: "2025-01-01" }, KEY()),
      ),
    ).toEqual([422, "invalid_range"]);
    expect(
      await failure(m.placeHold({ ...PLACE, to: "2025-01-01" }, KEY())),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(m.placeHold({ ...PLACE, from: "2025-02-30" }, KEY())),
    ).toEqual([422, "invalid"]);
    const one = await m.placeHold(
      { ...PLACE, from: "2025-01-01", to: "2025-01-01" },
      KEY(),
    );
    expect(one.scope).toEqual({ from: "2025-01-01", to: "2025-01-01" });
    const open = await m.placeHold({ ...PLACE, from: "2025-01-01" }, KEY());
    expect(open.scope).toEqual({ from: "2025-01-01", to: null });
  });

  it("a reference over 100 characters, or an asked-by over 200, is invalid", async () => {
    const { m } = setup();
    const bad: Partial<PlaceHoldIn>[] = [
      { reference: "R".repeat(101) },
      { asked_by: "A".repeat(201) },
      { reference: "  " },
      { asked_by: "" },
      { note: "N".repeat(501) },
      { reason: "other" },
      { reason: "sometime" as "other", note: "x" },
      { review_on: "next spring" },
    ];
    for (const b of bad)
      expect(await failure(m.placeHold({ ...PLACE, ...b }, KEY()))).toEqual([
        422,
        "invalid",
      ]);
    const noRef = { ...PLACE, reference: undefined } as unknown as PlaceHoldIn;
    expect(await failure(m.placeHold(noRef, KEY()))).toEqual([422, "invalid"]);
    expect(
      (
        await m.placeHold(
          {
            ...PLACE,
            reference: "R".repeat(100),
            asked_by: "A".repeat(200),
            reason: "other",
            note: "N".repeat(500),
          },
          KEY(),
        )
      ).reference,
    ).toHaveLength(100);
  });

  it("only review_on and note can be edited; a stale version is conflict", async () => {
    const { m } = setup();
    const hv = await m.getHold("hold_hv");
    const e = await m.editHold(
      "hold_hv",
      {
        review_on: "2027-06-01",
        note: "Hearing set for May.",
        version: hv.version,
      },
      KEY(),
    );
    expect(e).toMatchObject({
      review_on: "2027-06-01",
      note: "Hearing set for May.",
      reference: "HC/2026/0412",
      version: hv.version + 1,
    });
    expect(e.history[0]).toMatchObject({
      action: "edited",
      actor: { id: "tm_ada" },
      detail: "Review date, Note",
    });
    expect(
      await failure(
        m.editHold("hold_hv", { note: "Again", version: hv.version }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    for (const extra of [
      { reference: "X" },
      { reason: "other" },
      { scope: { from: null, to: null } },
    ])
      expect(
        await failure(
          m.editHold(
            "hold_hv",
            { version: e.version, ...extra } as { version: number },
            KEY(),
          ),
        ),
      ).toEqual([422, "invalid"]);
    // A later review date ends Review due.
    const ng = await m.getHold("hold_ng");
    expect(ng.status).toBe("review_due");
    expect(
      (
        await m.editHold(
          "hold_ng",
          { review_on: "2027-01-31", version: ng.version },
          KEY(),
        )
      ).status,
    ).toBe("active");
    // A lifted hold changes no more.
    const lc = await m.getHold("hold_lc");
    expect(
      await failure(
        m.editHold("hold_lc", { note: "x", version: lc.version }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("a refused edit changes nothing; an edit that changes nothing isn't recorded", async () => {
    const { m } = setup();
    const h = await m.placeHold(
      { ...PLACE, reason: "other", note: "Board asked." },
      KEY(),
    );
    const events = async () =>
      (await m.listActivity({ hospital: "h_southpoint" })).events.length;
    const before = await events();
    // A new date with the required note cleared: 422, and the date stays.
    expect(
      await failure(
        m.editHold(
          h.id,
          { review_on: "2027-09-01", note: "", version: h.version },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    const after = await m.getHold(h.id);
    expect(after).toMatchObject({
      review_on: "2027-04-20",
      note: "Board asked.",
      version: h.version,
    });
    expect(after.history).toHaveLength(1);
    // The same values again: no new version, no history, no Activity.
    const same = await m.editHold(
      h.id,
      { review_on: "2027-04-20", note: "Board asked.", version: h.version },
      KEY(),
    );
    expect(same.version).toBe(h.version);
    expect(same.history).toHaveLength(1);
    expect(await events()).toBe(before);
  });

  it("approve, cancel and undo act only on the version seen: approving after a cancel and a new request is conflict", async () => {
    const { m, as } = setup();
    // Ada opens Tunde's request.
    const saw = await seen(m, "hold_rc");
    // Meanwhile Tunde cancels it and asks again, on a different authority.
    as(TEAM_EMAILS.tunde);
    await m.cancelLift("hold_rc", saw, KEY());
    const again = await m.requestLift(
      "hold_rc",
      { reason: "withdrawn", authority: "Phone call", ...CODE },
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
    expect((await m.getHold("hold_rc")).status).toBe("lift_requested");
    // No version at all is invalid.
    expect(
      await failure(
        m.approveLift(
          "hold_rc",
          CODE as { version: number } & typeof CODE,
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    // On the request she now sees, it goes through.
    const lifted = await m.approveLift(
      "hold_rc",
      { version: again.version, ...CODE },
      KEY(),
    );
    expect(lifted.status).toBe("lifted");
    // Undo, too, needs the version seen.
    expect(
      await failure(
        m.undoLift("hold_rc", { version: again.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    expect(
      (await m.undoLift("hold_rc", { version: lifted.version, ...CODE }, KEY()))
        .status,
    ).toBe("active");
  });

  it("an auditor can't place, edit or lift", async () => {
    const { m } = setup(TEAM_EMAILS.amara);
    expect((await m.listHolds({})).holds).toHaveLength(3);
    expect((await m.getHold("hold_rc")).lift?.requested_by_you).toBe(false);
    const refusals = [
      () => m.placeHold(PLACE, KEY()),
      () => m.editHold("hold_hv", { note: "x", version: 1 }, KEY()),
      () =>
        m.requestLift(
          "hold_hv",
          { reason: "case_closed", authority: "Letter", ...CODE },
          KEY(),
        ),
      () => m.approveLift("hold_rc", { version: 2, ...CODE }, KEY()),
      () => m.cancelLift("hold_rc", { version: 2 }, KEY()),
      () => m.undoLift("hold_lc", { version: 3, ...CODE }, KEY()),
    ];
    for (const run of refusals)
      expect(await failure(run())).toEqual([403, "forbidden"]);
    // Nothing changed.
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
          { reason: "case_closed", authority: "Letter", ...WRONG },
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
      await failure(
        m.undoLift(
          "hold_lc",
          { ...(await seen(m, "hold_lc")), ...WRONG },
          KEY(),
        ),
      ),
    ).toEqual([403, "mfa_invalid"]);
    // Nothing changed.
    expect(
      (await m.listHolds({ status: "all" })).holds.map((h) => h.status),
    ).toEqual(["active", "lift_requested", "review_due", "lifted", "lifted"]);
  });

  it("the requester's approval is same_person", async () => {
    const { m, as } = setup(TEAM_EMAILS.tunde);
    // Only the server's record of who asked (requested_by.id) decides.
    expect((await m.getHold("hold_rc")).lift?.requested_by_you).toBe(true);
    const v = await seen(m, "hold_rc");
    expect(
      await failure(m.approveLift("hold_rc", { ...v, ...CODE }, KEY())),
    ).toEqual([409, "same_person"]);
    as(TEAM_EMAILS.ada);
    expect((await m.getHold("hold_rc")).lift?.requested_by_you).toBe(false);
    // Either admin may cancel, with no step-up.
    const c = await m.cancelLift("hold_rc", v, KEY());
    expect(c).toMatchObject({ status: "active", lift: null });
    expect(c.history[0]).toMatchObject({
      action: "lift_cancelled",
      actor: { id: "tm_ada" },
    });
    expect(
      await failure(m.cancelLift("hold_rc", { version: c.version }, KEY())),
    ).toEqual([409, "conflict"]);
  });

  it("an approval after 7 days is expired, and the hold is back to active with lift_lapsed in its history", async () => {
    const { m, advance } = setup();
    // The approver opens it; asked 2 days ago, it lapses 5 days later.
    const v = await seen(m, "hold_rc");
    advance(5 * D);
    expect(
      await failure(m.approveLift("hold_rc", { ...v, ...CODE }, KEY())),
    ).toEqual([409, "expired"]);
    const rc = await m.getHold("hold_rc");
    expect(rc).toMatchObject({ status: "active", lift: null });
    expect(rc.history[0]).toMatchObject({
      action: "lift_lapsed",
      actor: { id: "tm_tunde" },
    });
    const lapsed = (await m.listActivity({})).events.filter(
      (e) => e.action === "hold_lift_lapsed",
    );
    expect(lapsed).toHaveLength(1);
    expect(lapsed[0]).toMatchObject({
      actor: { id: "tm_tunde" },
      hospital: { id: "h_riverside" },
      target: "CMP-0193",
    });
    // A second try, even with the new version, still says why.
    expect(
      await failure(
        m.approveLift("hold_rc", { version: rc.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "expired"]);
  });

  it("approve sets released_on 7 days on; undo before then restores active; after, it's conflict", async () => {
    const { m, as, advance } = setup(TEAM_EMAILS.tunde);
    const asked = await m.requestLift(
      "hold_hv",
      {
        reason: "case_closed",
        authority: "Court order 12 Oct 2026",
        note: "Settled.",
        ...CODE,
      },
      KEY(),
    );
    expect(asked).toMatchObject({
      status: "lift_requested",
      lift: {
        kind: "hold_lift",
        reason: "case_closed",
        authority: "Court order 12 Oct 2026",
        requested_by: { id: "tm_tunde" },
        requested_by_you: true,
        requested_at: iso(START),
        expires_at: iso(START + 7 * D),
        records_due: 1985,
        due_after: nextCleanUp(START),
        approved_by: null,
        released_on: null,
      },
    });
    expect(
      await failure(
        m.requestLift(
          "hold_hv",
          { reason: "case_closed", authority: "Again", ...CODE },
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
        released_on: iso(START + 8 * D),
      },
    });
    // Lifted inside the grace period: still kept, still blocking.
    expect((await m.getHospital("h_harbour")).legal_holds_active).toBe(1);

    advance(3 * D);
    const undone = await m.undoLift(
      "hold_hv",
      { version: lifted.version, ...CODE },
      KEY(),
    );
    expect(undone).toMatchObject({ status: "active", lift: null });
    expect(undone.history[0]?.action).toBe("lift_undone");

    // Again, and this time the grace period passes.
    as(TEAM_EMAILS.tunde);
    await m.requestLift(
      "hold_hv",
      { reason: "mistake", authority: "Wrong hospital", ...CODE },
      KEY(),
    );
    as(TEAM_EMAILS.ada);
    const again = await m.approveLift(
      "hold_hv",
      { ...(await seen(m, "hold_hv")), ...CODE },
      KEY(),
    );
    advance(7 * D);
    expect(
      await failure(
        m.undoLift("hold_hv", { version: again.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    const hv = await m.getHospital("h_harbour");
    expect(hv.legal_holds_active).toBe(0);
    expect(hv.removal?.blocking).toEqual([]);
  });

  it("passing released_on writes hold_released", async () => {
    const { m, advance } = setup();
    advance(4 * D);
    await m.listHolds({});
    await m.getHold("hold_lc");
    const released = (await m.listActivity({})).events.filter(
      (e) => e.action === "hold_released",
    );
    expect(released).toHaveLength(1);
    expect(released[0]).toMatchObject({
      actor: { id: "tm_ada" },
      hospital: { id: "h_lakeside" },
      target: "INV-77",
    });
    const lc = await m.getHold("hold_lc");
    expect(lc.history[0]).toMatchObject({
      action: "released",
      at: iso(START + 4 * D),
    });
    expect(lc.history.filter((e) => e.action === "released")).toHaveLength(1);
  });

  it("Activity carries the reference and never the note", async () => {
    const { m, as } = setup();
    const NOTE = "Ask the ward clerk before 5pm";
    const h = await m.placeHold({ ...PLACE, note: NOTE }, KEY());
    await m.editHold(
      h.id,
      { note: `${NOTE}, again`, version: h.version },
      KEY(),
    );
    as(TEAM_EMAILS.tunde);
    await m.requestLift(
      h.id,
      { reason: "other", note: NOTE, authority: "Letter", ...CODE },
      KEY(),
    );
    as(TEAM_EMAILS.ada);
    const lifted = await m.approveLift(
      h.id,
      { ...(await seen(m, h.id)), ...CODE },
      KEY(),
    );
    await m.undoLift(h.id, { version: lifted.version, ...CODE }, KEY());
    const events = (await m.listActivity({ hospital: "h_southpoint" })).events;
    const mine = events.filter((e) => e.action.startsWith("hold_"));
    expect(mine.map((e) => [e.action, e.target, e.detail])).toEqual([
      ["hold_lift_undone", "HC/2026/0999", "Other"],
      ["hold_lifted", "HC/2026/0999", "Other"],
      ["hold_lift_requested", "HC/2026/0999", "Other"],
      ["hold_edited", "HC/2026/0999", "Court case"],
      ["hold_placed", "HC/2026/0999", "Court case"],
    ]);
    expect(JSON.stringify(events)).not.toContain("ward clerk");
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
      h_lakeside: 1,
      h_hilltop: 0,
      h_ridgeway: 0,
      h_marlow: 0,
      h_fairhaven: 0,
    });
    const hv = await m.getHospital("h_harbour");
    expect(hv.legal_holds_active).toBe(1);
    expect(hv.legal_holds).toEqual([
      {
        id: "hold_hv",
        scope: { from: null, to: null },
        reference: "HC/2026/0412",
        status: "active",
        review_on: (await m.getHold("hold_hv")).review_on,
      },
    ]);
    expect(hv.removal?.checks.legal_holds).toBe(1);
    // Havana's hold was released: nothing kept.
    expect((await m.getHospital("h_havana")).legal_holds).toEqual([]);
    expect((await m.getHospital("h_northgate")).legal_holds).toEqual([
      {
        id: "hold_ng",
        scope: { from: "2025-01-01", to: "2025-06-30" },
        reference: "REG-INSP-2291",
        status: "review_due",
        review_on: (await m.getHold("hold_ng")).review_on,
      },
    ]);
  });
});
