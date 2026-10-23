import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  BlockedError,
  type HospitalIn,
  type TwoPersonRequest,
  type WriteOpts,
} from "./contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform, type MockCore } from "./mock";
import { MOCK_CODE, createStepUp } from "./step-up";

const START = Date.parse("2026-10-20T09:00:00.000Z");
let n = 0;
const KEY = () => ({ idempotencyKey: `k-${++n}` });
const CODE = { mfa_code: MOCK_CODE };

function setup(email: string | null = TEAM_EMAILS.ada) {
  let t = START;
  let me = email;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
  });
  return {
    m,
    as: (e: string | null) => void (me = e),
    advance: (ms: number) => void (t += ms),
  };
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

const NEW: HospitalIn = {
  name: "Lakeside Community Hospital",
  short_code: "lch",
  country: "NG",
  time_zone: "Africa/Lagos",
  email_domains: ["lakeside.example"],
  first_admin: { name: "Bola Ade", email: "bola.ade@lakeside.example" },
};

describe("mock platform API", () => {
  it("lists all nine sample hospitals and filters by status and by name or short code", async () => {
    const { m } = setup();
    const all = await m.listHospitals({});
    expect(all.hospitals.map((h) => h.name)).toEqual([
      "Havana Hospital",
      "Northgate General Hospital",
      "Riverside Children's Hospital",
      "Eastbrook Medical Centre",
      "Westfield Clinic",
      "Harbour View Hospital",
      "Southpoint Hospital",
      "Lakeside Community Clinic",
      "Hilltop Cottage Hospital",
    ]);
    expect(all.next_cursor).toBeNull();
    for (const h of all.hospitals) expect(h.id).toMatch(/^h_[A-Za-z0-9_-]+$/);

    const pending = await m.listHospitals({ status: "removal_pending" });
    expect(pending.hospitals.map((h) => h.id)).toEqual([
      "h_harbour",
      "h_southpoint",
    ]);
    const active = await m.listHospitals({ status: "active" });
    expect(active.hospitals.map((h) => h.id)).toEqual([
      "h_havana",
      "h_northgate",
      "h_riverside",
      "h_lakeside",
      "h_hilltop",
    ]);

    expect(
      (await m.listHospitals({ q: "river" })).hospitals.map((h) => h.id),
    ).toEqual(["h_riverside"]);
    const byCode = await m.listHospitals({ q: "ngh" });
    expect(byCode.hospitals.map((h) => h.id)).toEqual(["h_northgate"]);

    const northgate = await m.getHospital("h_northgate");
    expect(northgate).toMatchObject({
      status: "active",
      sso_enabled: true,
      staff_count: 214,
    });
    expect(await m.getHospital("h_riverside")).toMatchObject({
      sso_enabled: false,
      staff_count: 96,
    });
    expect((await m.getHospital("h_eastbrook")).first_admin?.status).toBe(
      "expired",
    );
    expect(await m.getHospital("h_westfield")).toMatchObject({
      status: "deactivated",
      deactivation: { reason: "contract_ended" },
    });
    expect(await failure(m.getHospital("h_nope"))).toEqual([404, "not_found"]);
  });

  it("add normalises domains and rejects a bad one", async () => {
    const { m } = setup();
    const h = await m.addHospital(
      { ...NEW, email_domains: [" Northgate.ORG , northgate.org"] },
      KEY(),
    );
    expect(h.email_domains).toEqual(["northgate.org"]);
    const two = await m.addHospital(
      {
        ...NEW,
        short_code: "LC2",
        email_domains: [" Lakeside.ORG ", "lakeside.org", "b.example"],
      },
      KEY(),
    );
    expect(two.email_domains).toEqual(["lakeside.org", "b.example"]);
    expect(
      await failure(
        m.addHospital(
          { ...NEW, short_code: "LC3", email_domains: ["not a domain"] },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(await failure(m.addHospital({ ...NEW, name: "" }, KEY()))).toEqual([
      422,
      "invalid",
    ]);
    expect(
      await failure(m.addHospital({ ...NEW, short_code: "TOO-LONG1" }, KEY())),
    ).toEqual([422, "invalid"]);
  });

  it("add with a used short code is 409 duplicate", async () => {
    const { m } = setup();
    expect(
      await failure(m.addHospital({ ...NEW, short_code: "ngh" }, KEY())),
    ).toEqual([409, "duplicate"]);
  });

  it("add creates a set-up-incomplete hospital with a pending first-admin invite", async () => {
    const { m } = setup();
    const key = KEY();
    const h = await m.addHospital(NEW, key);
    expect(h.id).toMatch(/^h_[A-Za-z0-9_-]+$/);
    expect(h).toMatchObject({
      name: "Lakeside Community Hospital",
      short_code: "LCH",
      status: "setup_incomplete",
      staff_count: 0,
      sso_enabled: false,
      version: 1,
      deactivation: null,
      removal: null,
      created_at: new Date(START).toISOString(),
      first_admin: {
        name: "Bola Ade",
        email: "bola.ade@lakeside.example",
        status: "pending",
        sent_at: new Date(START).toISOString(),
        expires_at: new Date(START + 7 * 86_400_000).toISOString(),
      },
    });
    expect(h.first_admin!.invite_id).toMatch(/^inv_[A-Za-z0-9_-]+$/);
    // A retry with the same key does not add it twice.
    expect((await m.addHospital(NEW, key)).id).toBe(h.id);
    expect((await m.listHospitals({})).hospitals).toHaveLength(10);
  });

  it("invites expire after 7 days", async () => {
    const { m, advance } = setup();
    const h = await m.addHospital(NEW, KEY());
    advance(7 * 86_400_000 + 1);
    expect((await m.getHospital(h.id)).first_admin?.status).toBe("expired");
    const again = await m.resendInvite(h.id, h.first_admin!.invite_id, KEY());
    expect(again.first_admin?.status).toBe("pending");
  });

  it("a stale version is 409 conflict", async () => {
    const { m } = setup();
    const h = await m.getHospital("h_northgate");
    const next = await m.updateHospital(
      h.id,
      { name: "Northgate General", version: h.version },
      KEY(),
    );
    expect(next.version).toBe(h.version + 1);
    expect(
      await failure(
        m.updateHospital(h.id, { name: "Again", version: h.version }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    const sso = await m.getSso(h.id);
    await m.saveSso(
      h.id,
      {
        enabled: true,
        sign_in_url: "https://sso.northgate.example/start",
        client_id: "mh-platform",
        issuer: "https://sso.northgate.example",
        allowed_domains: ["northgate.example"],
        version: sso.version,
      },
      KEY(),
    );
    expect(
      await failure(
        m.saveSso(
          h.id,
          {
            enabled: false,
            sign_in_url: "https://sso.northgate.example/start",
            client_id: "mh-platform",
            issuer: "https://sso.northgate.example",
            allowed_domains: [],
            version: sso.version,
          },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    const team = (await m.listTeam()).members;
    const amara = team.find((x) => x.id === "tm_amara")!;
    await m.changeRole(
      amara.id,
      { role: "platform_admin", version: amara.version },
      KEY(),
    );
    expect(
      await failure(
        m.changeRole(
          amara.id,
          { role: "auditor", version: amara.version },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("deactivate needs a valid code; wrong is mfa_invalid; five wrong is mfa_locked", async () => {
    const { m } = setup();
    const body = { reason: "contract_ended" as const };
    expect(
      await failure(
        m.deactivate("h_northgate", { ...body, mfa_code: "000000" }, KEY()),
      ),
    ).toEqual([403, "mfa_invalid"]);
    for (let i = 0; i < 4; i++)
      await m
        .deactivate("h_northgate", { ...body, mfa_code: "000000" }, KEY())
        .catch(() => {});
    expect(
      await failure(m.deactivate("h_northgate", { ...body, ...CODE }, KEY())),
    ).toEqual([429, "mfa_locked"]);
    expect((await m.getHospital("h_northgate")).status).toBe("active");

    const fresh = setup().m;
    const h = await fresh.deactivate(
      "h_northgate",
      { ...body, note: "Ended in September", ...CODE },
      KEY(),
    );
    expect(h).toMatchObject({
      status: "deactivated",
      deactivation: {
        by: { id: "tm_ada", name: "Ada Bakare" },
        reason: "contract_ended",
        note: "Ended in September",
      },
    });
  });

  it("an account without two-step gets mfa_required", async () => {
    const t = START;
    const m = createMockPlatform({
      now: () => t,
      me: () => TEAM_EMAILS.ada,
      delayMs: 0,
      stepUp: createStepUp(() => t),
      twoStep: () => false,
    });
    expect(
      await failure(
        m.deactivate(
          "h_northgate",
          { reason: "other", note: "x", ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([403, "mfa_required"]);
  });

  it("deactivate twice is 409 conflict", async () => {
    const { m } = setup();
    await m.deactivate(
      "h_riverside",
      { reason: "hospital_request", ...CODE },
      KEY(),
    );
    expect(
      await failure(
        m.deactivate(
          "h_riverside",
          { reason: "hospital_request", ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    // Reactivate only from deactivated.
    const back = await m.reactivate(
      "h_riverside",
      { reason: "Contract renewed", ...CODE },
      KEY(),
    );
    expect(back).toMatchObject({ status: "active", deactivation: null });
    expect(
      await failure(
        m.reactivate("h_riverside", { reason: "Again", ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("request removal only from deactivated", async () => {
    const { m } = setup();
    expect(
      await failure(
        m.requestRemoval("h_northgate", { reason: "Closed", ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
    const h = await m.requestRemoval(
      "h_westfield",
      { reason: "Contract ended a year ago", ...CODE },
      KEY(),
    );
    expect(h.status).toBe("removal_pending");
    expect(h.removal).toMatchObject({
      status: "requested",
      requested_by: { id: "tm_ada", name: "Ada Bakare" },
      requested_by_you: true,
      reason: "Contract ended a year ago",
      approved_by: null,
      blocking: [],
      checks: { legal_holds: 0, export_required: false },
    });
  });

  it("requested_by_you is true for the requester only, on every read and write", async () => {
    const { m, as } = setup(TEAM_EMAILS.tunde);
    expect(
      (await m.getHospital("h_southpoint")).removal?.requested_by_you,
    ).toBe(true);
    as(TEAM_EMAILS.ada);
    expect(
      (await m.getHospital("h_southpoint")).removal?.requested_by_you,
    ).toBe(false);
    const h = await m.requestRemoval(
      "h_westfield",
      { reason: "Closed", ...CODE },
      KEY(),
    );
    expect(h.removal?.requested_by_you).toBe(true);
    as(TEAM_EMAILS.tunde);
    expect((await m.getHospital("h_westfield")).removal?.requested_by_you).toBe(
      false,
    );
    expect(
      (await m.approveRemoval("h_westfield", CODE, KEY())).removal
        ?.requested_by_you,
    ).toBe(false);
  });

  it("approve by the requester is same_person", async () => {
    const { m, as } = setup(TEAM_EMAILS.tunde);
    // Tunde asked for both sample removals.
    expect(
      await failure(m.approveRemoval("h_southpoint", CODE, KEY())),
    ).toEqual([409, "same_person"]);
    as(TEAM_EMAILS.ada);
    expect((await m.approveRemoval("h_southpoint", CODE, KEY())).status).toBe(
      "removal_scheduled",
    );
  });

  it("approve while a legal hold blocks is 409 blocked with ['legal_hold']", async () => {
    const { m } = setup();
    const h = await m.getHospital("h_harbour");
    expect(h.removal?.blocking).toEqual(["legal_hold"]);
    expect(h.removal?.checks.legal_holds).toBe(1);
    const e = await m.approveRemoval("h_harbour", CODE, KEY()).catch((x) => x);
    expect(e).toBeInstanceOf(BlockedError);
    expect(e).toMatchObject({
      status: 409,
      code: "blocked",
      blocking: ["legal_hold"],
    });
    expect((await m.getHospital("h_harbour")).status).toBe("removal_pending");
  });

  it("approve after cancel is 404", async () => {
    const { m } = setup();
    const h = await m.cancelRemoval("h_southpoint", KEY());
    expect(h).toMatchObject({ status: "deactivated", removal: null });
    expect(
      await failure(m.approveRemoval("h_southpoint", CODE, KEY())),
    ).toEqual([404, "not_found"]);
    expect(await failure(m.approveRemoval("h_northgate", CODE, KEY()))).toEqual(
      [404, "not_found"],
    );
  });

  it("approve schedules, and a minute later reads as removed", async () => {
    const { m, advance } = setup();
    const h = await m.approveRemoval("h_southpoint", CODE, KEY());
    expect(h).toMatchObject({
      status: "removal_scheduled",
      removal: {
        status: "scheduled",
        approved_by: { id: "tm_ada", name: "Ada Bakare" },
        approved_at: new Date(START).toISOString(),
      },
    });
    advance(59_999);
    expect((await m.getHospital("h_southpoint")).status).toBe(
      "removal_scheduled",
    );
    advance(1);
    const gone = await m.getHospital("h_southpoint");
    expect(gone.status).toBe("removed");
    expect(gone.removal?.status).toBe("done");
    expect(
      (await m.listHospitals({ status: "removed" })).hospitals.map((x) => x.id),
    ).toEqual(["h_southpoint"]);
    expect(await failure(m.cancelRemoval("h_southpoint", KEY()))).toEqual([
      409,
      "conflict",
    ]);
  });

  it("removing the last platform admin is last_admin; changing your own role is own_role", async () => {
    const { m } = setup();
    const team = (await m.listTeam()).members;
    expect(team.map((x) => [x.id, x.role, x.status, x.is_you])).toEqual([
      ["tm_ada", "platform_admin", "active", true],
      ["tm_tunde", "platform_admin", "active", false],
      ["tm_amara", "auditor", "active", false],
      ["tm_kemi", "auditor", "invite_pending", false],
      ["tm_new", "platform_admin", "active", false],
      ["tm_bola", "platform_admin", "active", false],
    ]);
    const ada = team[0]!;
    expect(
      await failure(
        m.changeRole(ada.id, { role: "auditor", version: ada.version }, KEY()),
      ),
    ).toEqual([409, "own_role"]);
    await m.removeMember("tm_tunde", CODE, KEY());
    await m.removeMember("tm_new", CODE, KEY());
    await m.removeMember("tm_bola", CODE, KEY());
    expect(await failure(m.removeMember("tm_ada", CODE, KEY()))).toEqual([
      409,
      "last_admin",
    ]);
    expect(
      await failure(
        m.changeRole(ada.id, { role: "auditor", version: ada.version }, KEY()),
      ),
    ).toEqual([409, "last_admin"]);
    expect(await failure(m.removeMember("tm_nobody", CODE, KEY()))).toEqual([
      404,
      "not_found",
    ]);
  });

  it("an auditor's write is forbidden", async () => {
    const { m, as } = setup(TEAM_EMAILS.amara);
    expect((await m.listHospitals({})).hospitals).toHaveLength(9);
    expect((await m.listTeam()).members.find((x) => x.is_you)?.id).toBe(
      "tm_amara",
    );
    expect(await failure(m.addHospital(NEW, KEY()))).toEqual([
      403,
      "forbidden",
    ]);
    expect(
      await failure(
        m.deactivate(
          "h_northgate",
          { reason: "other", note: "x", ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
    expect(await failure(m.cancelRemoval("h_harbour", KEY()))).toEqual([
      403,
      "forbidden",
    ]);
    as(null);
    expect(await failure(m.listTeam())).toEqual([401, "session_expired"]);
  });

  it("every write adds one activity event", async () => {
    const { m, advance } = setup();
    const count = async () => (await m.listActivity({})).events.length;
    expect(await count()).toBe(12);
    const added = await m.addHospital(NEW, KEY());
    const writes: [string, () => Promise<unknown>][] = [
      ["hospital_added", async () => {}],
      [
        "hospital_updated",
        async () =>
          m.updateHospital(
            "h_riverside",
            {
              time_zone: "Africa/Lagos",
              version: (await m.getHospital("h_riverside")).version,
            },
            KEY(),
          ),
      ],
      [
        "sso_updated",
        async () =>
          m.saveSso(
            "h_riverside",
            {
              enabled: true,
              sign_in_url: "https://sso.riverside.example/start",
              client_id: "mh",
              issuer: "https://sso.riverside.example",
              allowed_domains: ["riverside.example"],
              client_secret: "s3cr3t-value-3f2a",
              version: (await m.getSso("h_riverside")).version,
            },
            KEY(),
          ),
      ],
      ["sso_tested", () => m.testSso("h_riverside", KEY())],
      [
        "admin_invited",
        () =>
          m.inviteAdmin(
            "h_eastbrook",
            { name: "Femi Ola", email: "femi.ola@eastbrook.example" },
            KEY(),
          ),
      ],
      [
        "admin_invite_resent",
        async () =>
          m.resendInvite(added.id, added.first_admin!.invite_id, KEY()),
      ],
      [
        "hospital_deactivated",
        () =>
          m.deactivate(
            "h_riverside",
            { reason: "security_concern", ...CODE },
            KEY(),
          ),
      ],
      [
        "hospital_reactivated",
        () =>
          m.reactivate("h_riverside", { reason: "Resolved", ...CODE }, KEY()),
      ],
      [
        "removal_requested",
        () =>
          m.requestRemoval("h_westfield", { reason: "Ended", ...CODE }, KEY()),
      ],
      ["removal_cancelled", () => m.cancelRemoval("h_westfield", KEY())],
      ["removal_approved", () => m.approveRemoval("h_southpoint", CODE, KEY())],
      [
        "team_invited",
        () =>
          m.inviteTeam(
            {
              name: "Sade Uche",
              email: "sade.uche@measured-health.example",
              role: "auditor",
            },
            KEY(),
          ),
      ],
      [
        "team_role_changed",
        async () =>
          m.changeRole(
            "tm_amara",
            {
              role: "platform_admin",
              version: (await m.listTeam()).members.find(
                (x) => x.id === "tm_amara",
              )!.version,
            },
            KEY(),
          ),
      ],
      ["team_removed", () => m.removeMember("tm_kemi", CODE, KEY())],
    ];
    let expected = 13;
    for (const [action, run] of writes) {
      await run();
      const { events } = await m.listActivity({});
      expect(events).toHaveLength(expected);
      expect(events[0]).toMatchObject({
        action,
        actor: { id: "tm_ada", name: "Ada Bakare" },
      });
      expect(events[0]!.id).toMatch(/^ev_[A-Za-z0-9_-]+$/);
      expected++;
    }
    // A removal that becomes final is logged once.
    advance(60_000);
    await m.getHospital("h_southpoint");
    await m.listHospitals({});
    const { events } = await m.listActivity({});
    expect(events).toHaveLength(expected);
    expect(events[0]!.action).toBe("hospital_removed");
    // Filter by hospital.
    const westfield = await m.listActivity({ hospital: "h_westfield" });
    expect(
      westfield.events.every((e) => e.hospital?.id === "h_westfield"),
    ).toBe(true);
    expect(westfield.events.slice(0, 2).map((e) => e.action)).toEqual([
      "removal_cancelled",
      "removal_requested",
    ]);
  });

  it("a change to the sign-in set-up voids the last test", async () => {
    const { m } = setup();
    const before = await m.getSso("h_northgate");
    expect(before.last_test?.ok).toBe(true);
    const same = {
      enabled: true,
      sign_in_url: before.sign_in_url!,
      client_id: before.client_id!,
      issuer: before.issuer!,
      allowed_domains: before.allowed_domains,
    };
    const kept = await m.saveSso(
      "h_northgate",
      { ...same, version: before.version },
      KEY(),
    );
    expect(kept.last_test).toEqual(before.last_test);
    const changed = await m.saveSso(
      "h_northgate",
      { ...same, client_id: "other", version: kept.version },
      KEY(),
    );
    expect(changed.last_test).toBeNull();
    const again = await m.testSso("h_northgate", KEY());
    expect(again.last_test?.ok).toBe(true);
    const secret = await m.saveSso(
      "h_northgate",
      {
        ...same,
        client_id: "other",
        client_secret: "a-new-secret-1234",
        version: changed.version,
      },
      KEY(),
    );
    expect(secret.last_test).toBeNull();
  });
});

/**
 * A stand-in for an area's mock (holds, operations, settings, audit): built
 * on the core as the real ones are, so the seam is tested on its own.
 */
function sampleArea(core: MockCore) {
  type Store = { requests: TwoPersonRequest[] };
  const store = () => (core.shared.sample ??= { requests: [] }) as Store;
  return {
    ask: (reason: string, opts: WriteOpts) =>
      core.write(opts, async (m) => {
        await core.checkCode(m, { mfa_code: MOCK_CODE });
        const req: TwoPersonRequest = {
          id: core.newId("req"),
          kind: "hold_lift",
          requested_by: { id: m.id, name: m.name },
          requested_at: new Date(core.now()).toISOString(),
          reason,
          // Set per caller on the way out.
          requested_by_you: true,
          expires_at: new Date(core.now() + 7 * 864e5).toISOString(),
        };
        store().requests.push(req);
        core.log({ id: m.id, name: m.name }, "hold_lift_requested", {
          hospital: { id: "h_lakeside", name: "Lakeside Community Clinic" },
          target: "LH-1",
        });
        return { lift: req, pending: [req] };
      }),
    list: () => core.read(() => ({ pending: store().requests })),
  };
}

function setupArea(email: string = TEAM_EMAILS.ada) {
  const t = START;
  let me: string | null = email;
  let core: MockCore | undefined;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    onCore: (c) => void (core = c),
  });
  if (!core) throw new Error("onCore was not called");
  return {
    m,
    core,
    area: sampleArea(core),
    as: (e: string | null) => void (me = e),
  };
}

describe("the mock core that each area builds on", () => {
  it("an extension's write refuses an auditor with 403", async () => {
    const { area, as } = setupArea(TEAM_EMAILS.amara);
    expect(await failure(area.ask("Case closed", KEY()))).toEqual([
      403,
      "forbidden",
    ]);
    as(null);
    expect(await failure(area.list())).toEqual([401, "session_expired"]);
  });

  it("an extension's write replays the same Idempotency-Key", async () => {
    const { m, area } = setupArea();
    const before = (await m.listActivity({})).events.length;
    const key = KEY();
    const a = await area.ask("Case closed", key);
    const b = await area.ask("Case closed", key);
    expect(b.lift.id).toBe(a.lift.id);
    expect((await area.list()).pending).toHaveLength(1);
    expect((await m.listActivity({})).events).toHaveLength(before + 1);
  });

  it("the core's log shows in listActivity", async () => {
    const { m, area } = setupArea();
    await area.ask("Case closed", KEY());
    const [first] = (await m.listActivity({})).events;
    expect(first).toMatchObject({
      actor: { id: "tm_ada", name: "Ada Bakare" },
      action: "hold_lift_requested",
      hospital: { id: "h_lakeside" },
      target: "LH-1",
      detail: null,
    });
    expect(first!.id).toMatch(/^[A-Za-z0-9_-]+$/);
    const byHospital = await m.listActivity({ hospital: "h_lakeside" });
    expect(byHospital.events[0]?.action).toBe("hold_lift_requested");
  });

  it("requested_by_you is true for the requester only, on any request it reads", async () => {
    const { area, as } = setupArea();
    const asked = await area.ask("Case closed", KEY());
    expect(asked.lift.requested_by_you).toBe(true);
    expect(asked.pending[0]?.requested_by_you).toBe(true);
    as(TEAM_EMAILS.tunde);
    expect((await area.list()).pending[0]?.requested_by_you).toBe(false);
    as(TEAM_EMAILS.amara);
    expect((await area.list()).pending[0]?.requested_by_you).toBe(false);
    as(TEAM_EMAILS.ada);
    expect((await area.list()).pending[0]?.requested_by_you).toBe(true);
  });

  it("the core gives the hospitals, the signed-in person, ids and own writes", async () => {
    const { core, as } = setupArea(TEAM_EMAILS.amara);
    expect(core.hospitals()).toHaveLength(9);
    expect(core.findHospital("h_harbour").hospital.status).toBe(
      "removal_pending",
    );
    expect(() => core.findHospital("h_nowhere")).toThrow(ApiError);
    expect(core.you().id).toBe("tm_amara");
    expect(core.now()).toBe(START);
    const a = core.newId("x");
    expect(a).toMatch(/^x_[A-Za-z0-9_-]+$/);
    expect(core.newId("x")).not.toBe(a);
    await core.wait();
    // An own write: an auditor may make it; the same key replays.
    let runs = 0;
    const key = KEY();
    const once = () => core.own(key, () => ++runs);
    expect(await once()).toBe(1);
    expect(await once()).toBe(1);
    as(null);
    expect(() => core.you()).toThrow(ApiError);
  });
});
