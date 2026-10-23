import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import type { Signoffs } from "./clearances-contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform } from "./mock";
import { MOCK_CODE, createStepUp } from "./step-up";

const START = Date.parse("2026-10-22T09:30:00.000Z");
const D = 24 * 3_600_000;
let n = 0;
const KEY = () => ({ idempotencyKey: `cl-${++n}` });
const CODE = { mfa_code: MOCK_CODE };

function setup(
  over: {
    email?: string | null;
    clearances?: "normal" | "unavailable" | "off";
  } = {},
) {
  let t = START;
  let me = over.email === undefined ? TEAM_EMAILS.ada : over.email;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    clearances: over.clearances,
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

const activity = async (m: Mock) => (await m.listActivity({})).events;
const actions = async (m: Mock) => (await activity(m)).map((e) => e.action);
const SIGNOFFS: Signoffs = {
  clinical: {
    by: "Dr. A. Musa, Clinical lead",
    at: "2026-10-20",
    ref: "CS-020",
  },
  privacy: { by: "N. Eke, Data protection", at: "2026-10-20", ref: "PR-011" },
  legal: { by: "B. Adeyemi, Legal counsel", at: "2026-10-21", ref: "LG-030" },
};
const switchOf = async (m: Mock, hospital: string) =>
  (await m.getNamedAccess()).hospitals.find((h) => h.hospital.id === hospital)!;

describe("mock clearances: the letters", () => {
  it("the queue's To verify is waiting letters, oldest first", async () => {
    const { m } = setup();
    const { clearances } = await m.listClearances({ status: "waiting" });
    expect(clearances.length).toBeGreaterThanOrEqual(2);
    expect(clearances.every((c) => c.status === "waiting")).toBe(true);
    expect(clearances.map((c) => c.id)).toEqual(
      expect.arrayContaining(["cl_wait", "cl_north"]),
    );
    const at = clearances.map((c) => Date.parse(c.ready_at ?? c.uploaded_at));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("Ending soon is active letters within 30 days", async () => {
    const { m } = setup();
    const soon = (await m.listClearances({ status: "ending_soon" })).clearances;
    expect(soon.map((c) => c.id)).toEqual(["cl_soon", "cl_river"]);
    expect(soon.every((c) => c.status === "active")).toBe(true);
    const active = (await m.listClearances({ status: "active" })).clearances;
    expect(active.map((c) => c.id).sort()).toEqual(
      ["cl_act", "cl_northgate_2026", "cl_river", "cl_soon"].sort(),
    );
    // Havana's set, Northgate's two and Riverside's one, by hospital.
    const all = (await m.listClearances({ status: "all" })).clearances;
    expect(all).toHaveLength(11);
    const havana = (await m.listClearances({ hospital: "h_havana" }))
      .clearances;
    expect(havana.map((c) => c.id).sort()).toEqual(
      [
        "cl_check",
        "cl_bad",
        "cl_wait",
        "cl_act",
        "cl_soon",
        "cl_rej",
        "cl_end",
        "cl_rev",
      ].sort(),
    );
    expect((await m.getClearance("cl_northgate_2026")).status).toBe("active");
  });

  it("Bola gets verifiable_by_you false on Havana and true on Northgate", async () => {
    const { m } = setup({ email: TEAM_EMAILS.bola });
    expect((await m.getClearance("cl_wait")).verifiable_by_you).toBe(false);
    expect((await m.getClearance("cl_north")).verifiable_by_you).toBe(true);
    // Ada is linked to neither.
    const { m: ada } = setup();
    expect((await ada.getClearance("cl_wait")).verifiable_by_you).toBe(true);
    expect((await ada.getClearance("cl_north")).verifiable_by_you).toBe(true);
  });

  it("Bola verifying Havana is 409 same_side and logs it", async () => {
    const { m } = setup({ email: TEAM_EMAILS.bola });
    const c = await m.getClearance("cl_wait");
    expect(
      await failure(
        m.verifyClearance("cl_wait", { version: c.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "same_side"]);
    const [e] = await activity(m);
    expect(e).toMatchObject({
      action: "clearance_verify_refused",
      actor: { id: "tm_bola", name: "Bola Hassan" },
      hospital: { id: "h_havana", name: "Havana Hospital" },
      target: "the clearance letter signed by Dr. Funmi Ade",
    });
    expect((await m.getClearance("cl_wait")).status).toBe("waiting");
    // Northgate is his to verify.
    const north = await m.getClearance("cl_north");
    const done = await m.verifyClearance(
      "cl_north",
      { version: north.version, ...CODE },
      KEY(),
    );
    expect(done.status).toBe("active");
    expect(done.verified_by).toEqual({ id: "tm_bola", name: "Bola Hassan" });
  });

  it("Tunde verifying or rejecting cl_wait, which covers him, is 409 same_person; Ada can verify it", async () => {
    const { m, as } = setup({ email: TEAM_EMAILS.tunde });
    const c = await m.getClearance("cl_wait");
    expect(c.verifiable_by_you).toBe(false);
    expect(
      await failure(
        m.verifyClearance("cl_wait", { version: c.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "same_person"]);
    expect(
      await failure(
        m.rejectClearance(
          "cl_wait",
          { reason: "wrong_people", version: c.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "same_person"]);
    expect((await actions(m)).slice(0, 2)).toEqual([
      "clearance_verify_refused",
      "clearance_verify_refused",
    ]);
    as(TEAM_EMAILS.ada);
    const ok = await m.verifyClearance(
      "cl_wait",
      { version: c.version, ...CODE },
      KEY(),
    );
    expect(ok.status).toBe("active");
    expect(ok.verified_by).toEqual({ id: "tm_ada", name: "Ada Bakare" });
    expect(ok.history.at(-1)).toMatchObject({
      kind: "verified",
      side: "platform",
      by: { id: "tm_ada" },
    });
  });

  it("covers_you is true for Tunde on cl_wait and false for Ada", async () => {
    const { m, as } = setup({ email: TEAM_EMAILS.tunde });
    const c = await m.getClearance("cl_wait");
    expect(c.covers_you).toBe(true);
    expect(c.covered_platform).toEqual([
      { id: "tm_tunde", name: "Tunde Okafor" },
    ]);
    as(TEAM_EMAILS.ada);
    expect((await m.getClearance("cl_wait")).covers_you).toBe(false);
  });

  it("covers=me lists only the letters that cover the caller: cl_wait for Tunde, none for Ada", async () => {
    const { m, as } = setup({ email: TEAM_EMAILS.tunde });
    const mine = await m.listClearances({ covers: "me" });
    expect(mine.clearances.map((c) => c.id)).toEqual(["cl_wait"]);
    as(TEAM_EMAILS.ada);
    expect((await m.listClearances({ covers: "me" })).clearances).toEqual([]);
  });

  it("an auditor is 403", async () => {
    const { m } = setup({ email: TEAM_EMAILS.amara });
    const c = await m.getClearance("cl_north");
    // Reads, and sees it as not theirs to verify.
    expect(c.verifiable_by_you).toBe(false);
    expect(
      await failure(
        m.verifyClearance("cl_north", { version: c.version, ...CODE }, KEY()),
      ),
    ).toEqual([403, "forbidden"]);
    expect(
      await failure(
        m.rejectClearance(
          "cl_north",
          { reason: "unreadable", version: c.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
    expect(
      await failure(
        m.revokeClearance(
          "cl_north",
          { reason: "no_longer_needed", version: c.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
    // Auditors view letters too.
    const page = await m.getClearancePage("cl_north", 1);
    expect(page.type).toBe("image/svg+xml");
  });

  it("verifying a checking letter is 409 not_ready", async () => {
    const { m } = setup();
    const c = await m.getClearance("cl_check");
    expect(c.status).toBe("checking");
    expect(
      await failure(
        m.verifyClearance("cl_check", { version: c.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "not_ready"]);
    // Any other status is a clash.
    const act = await m.getClearance("cl_act");
    expect(
      await failure(
        m.verifyClearance("cl_act", { version: act.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("a stale version is 409 conflict", async () => {
    const { m } = setup();
    const c = await m.getClearance("cl_north");
    expect(
      await failure(
        m.verifyClearance(
          "cl_north",
          { version: c.version + 1, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(
        m.revokeClearance(
          "cl_north",
          { reason: "no_longer_needed", version: c.version - 1, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    // A wrong code changes nothing.
    expect(
      await failure(
        m.verifyClearance(
          "cl_north",
          { version: c.version, mfa_code: "000000" },
          KEY(),
        ),
      ),
    ).toEqual([403, "mfa_invalid"]);
    expect((await m.getClearance("cl_north")).status).toBe("waiting");
  });

  it("reject Other needs a note", async () => {
    const { m } = setup();
    const c = await m.getClearance("cl_north");
    expect(
      await failure(
        m.rejectClearance(
          "cl_north",
          { reason: "other", version: c.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.rejectClearance(
          "cl_north",
          { reason: "other", note: "  ", version: c.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    const r = await m.rejectClearance(
      "cl_north",
      {
        reason: "other",
        note: "The signature page is missing.",
        version: c.version,
        ...CODE,
      },
      KEY(),
    );
    expect(r.status).toBe("rejected");
    expect(r.rejection).toMatchObject({
      by: { id: "tm_ada" },
      reason: "other",
      note: "The signature page is missing.",
    });
    expect(r.version).toBe(c.version + 1);
  });

  it("revoke an active letter", async () => {
    const { m } = setup();
    const c = await m.getClearance("cl_act");
    const r = await m.revokeClearance(
      "cl_act",
      { reason: "security_concern", version: c.version, ...CODE },
      KEY(),
    );
    expect(r.status).toBe("revoked");
    expect(r.revocation).toMatchObject({
      by: { id: "tm_ada", name: "Ada Bakare" },
      side: "platform",
      reason: "security_concern",
      note: null,
      day: "2026-10-22",
    });
    // Only waiting or active.
    const end = await m.getClearance("cl_end");
    expect(
      await failure(
        m.revokeClearance(
          "cl_end",
          { reason: "no_longer_needed", version: end.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(
        m.revokeClearance(
          "cl_soon",
          {
            reason: "other",
            version: (await m.getClearance("cl_soon")).version,
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
  });

  it("a page is a watermarked SVG and logs the view", async () => {
    const { m } = setup({ email: TEAM_EMAILS.tunde });
    const page = await m.getClearancePage("cl_act", 2);
    expect(page.type).toBe("image/svg+xml");
    const text = await page.text();
    expect(text).toContain("Tunde Okafor · 22 Oct 2026 10:30");
    expect(text).not.toContain("<script");
    expect(await failure(m.getClearancePage("cl_act", 3))).toEqual([
      404,
      "not_found",
    ]);
    expect(await failure(m.getClearancePage("cl_check", 1))).toEqual([
      409,
      "not_ready",
    ]);
    const [e] = await activity(m);
    expect(e).toMatchObject({
      action: "clearance_viewed",
      hospital: { id: "h_havana" },
      target: "the clearance letter signed by Dr. Funmi Ade",
    });
  });

  it("the unavailable option fails the list and the switch with 503", async () => {
    const { m } = setup({ clearances: "unavailable" });
    expect(await failure(m.listClearances({}))).toEqual([503, "unavailable"]);
    expect(await failure(m.getNamedAccess())).toEqual([503, "unavailable"]);
  });
});

describe("mock clearances: the named-access switch", () => {
  it("seeds global On since 3 Feb, Havana On, Northgate turned Off 5 days ago", async () => {
    const { m } = setup();
    const s = await m.getNamedAccess();
    expect(s.global.position).toBe("on");
    expect(s.global.since?.slice(0, 10)).toBe("2026-02-03");
    expect(s.global.history[0]).toMatchObject({
      from: "off",
      to: "on",
      requested_by: { name: "Ada Bakare" },
      approved_by: { name: "Tunde Okafor" },
      lowered_by: null,
      signoffs: {
        clinical: { by: "Dr. A. Musa", at: "2026-02-01", ref: "CS-014" },
      },
    });
    expect(s.global.request).toBeNull();
    const havana = await switchOf(m, "h_havana");
    expect([havana.position, havana.effective]).toEqual(["on", "on"]);
    const north = await switchOf(m, "h_northgate");
    expect(north.position).toBe("off");
    expect(north.history.map((c) => [c.from, c.to])).toEqual([
      ["on", "off"],
      ["off", "on"],
    ]);
    expect(Date.parse(north.since!)).toBe(START - 5 * D);
    expect(north.history[0]!.lowered_by).toEqual({
      id: "tm_tunde",
      name: "Tunde Okafor",
    });
    const river = await switchOf(m, "h_riverside");
    expect([river.position, river.history]).toEqual(["off", []]);
  });

  it("a raise without the legal sign-off is 409 signoff_missing", async () => {
    const { m } = setup();
    const river = await switchOf(m, "h_riverside");
    for (const legal of [
      { by: "B. Adeyemi", at: "2026-10-21", ref: " " },
      { by: "", at: "2026-10-21", ref: "LG-030" },
      undefined,
    ])
      expect(
        await failure(
          m.requestNamedAccess(
            {
              hospital: "h_riverside",
              position: "letters_only",
              signoffs: { ...SIGNOFFS, legal } as Signoffs,
              version: river.version,
              ...CODE,
            },
            KEY(),
          ),
        ),
      ).toEqual([409, "signoff_missing"]);
    // Not a raise: nothing to ask for.
    expect(
      await failure(
        m.requestNamedAccess(
          {
            hospital: "h_havana",
            position: "letters_only",
            signoffs: SIGNOFFS,
            version: (await switchOf(m, "h_havana")).version,
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect((await switchOf(m, "h_riverside")).request).toBeNull();
  });

  it("the requester can't approve: 409 same_person; Tunde can", async () => {
    const { m, as } = setup();
    const before = await switchOf(m, "h_riverside");
    const out = await m.requestNamedAccess(
      {
        hospital: "h_riverside",
        position: "letters_only",
        signoffs: SIGNOFFS,
        version: before.version,
        ...CODE,
      },
      KEY(),
    );
    const river = out.hospitals.find((h) => h.hospital.id === "h_riverside")!;
    const req = river.request!;
    expect(req).toMatchObject({
      kind: "named_access",
      hospital: { id: "h_riverside", name: "Riverside Children's Hospital" },
      position: "letters_only",
      requested_by: { id: "tm_ada" },
      requested_by_you: true,
      signoffs: SIGNOFFS,
    });
    expect(Date.parse(req.expires_at)).toBe(START + 7 * D);
    expect(river.position).toBe("off");
    // One open request per scope.
    expect(
      await failure(
        m.requestNamedAccess(
          {
            hospital: "h_riverside",
            position: "on",
            signoffs: SIGNOFFS,
            version: river.version,
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(
        m.approveNamedAccess(
          req.id,
          { version: river.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "same_person"]);
    as(TEAM_EMAILS.tunde);
    const seen = await switchOf(m, "h_riverside");
    expect(seen.request!.requested_by_you).toBe(false);
    expect(
      await failure(
        m.approveNamedAccess(
          req.id,
          { version: seen.version + 1, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    const done = await m.approveNamedAccess(
      req.id,
      { version: seen.version, ...CODE },
      KEY(),
    );
    const after = done.hospitals.find((h) => h.hospital.id === "h_riverside")!;
    expect([after.position, after.effective, after.request]).toEqual([
      "letters_only",
      "letters_only",
      null,
    ]);
    expect(after.history[0]).toMatchObject({
      from: "off",
      to: "letters_only",
      requested_by: { id: "tm_ada" },
      approved_by: { id: "tm_tunde" },
      signoffs: SIGNOFFS,
    });
  });

  it("a request lapses after 7 days: approving it is 409 expired", async () => {
    const { m, as, advance } = setup();
    const g = (await m.getNamedAccess()).hospitals.find(
      (h) => h.hospital.id === "h_eastbrook",
    )!;
    const out = await m.requestNamedAccess(
      {
        hospital: "h_eastbrook",
        position: "on",
        signoffs: SIGNOFFS,
        version: g.version,
        ...CODE,
      },
      KEY(),
    );
    const req = out.hospitals.find(
      (h) => h.hospital.id === "h_eastbrook",
    )!.request!;
    advance(7 * D + 1);
    as(TEAM_EMAILS.tunde);
    const now = await switchOf(m, "h_eastbrook");
    expect(now.request).toBeNull();
    expect(
      await failure(
        m.approveNamedAccess(req.id, { version: now.version, ...CODE }, KEY()),
      ),
    ).toEqual([409, "expired"]);
  });

  it("cancel a pending request: any admin, the version it saw", async () => {
    const { m, as } = setup();
    const r = await switchOf(m, "h_riverside");
    const out = await m.requestNamedAccess(
      {
        hospital: "h_riverside",
        position: "on",
        signoffs: SIGNOFFS,
        version: r.version,
        ...CODE,
      },
      KEY(),
    );
    const river = out.hospitals.find((h) => h.hospital.id === "h_riverside")!;
    as(TEAM_EMAILS.bola);
    expect(
      await failure(
        m.cancelNamedAccess(
          river.request!.id,
          { version: river.version - 1 },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    const done = await m.cancelNamedAccess(
      river.request!.id,
      { version: river.version },
      KEY(),
    );
    expect(
      done.hospitals.find((h) => h.hospital.id === "h_riverside")!.request,
    ).toBeNull();
    expect((await activity(m))[0]).toMatchObject({
      action: "named_access_cancelled",
      actor: { id: "tm_bola" },
      target: "On for Riverside Children's Hospital",
    });
  });

  it("a hospital raised above global is 409 above_global", async () => {
    const { m } = setup();
    const g = await m.getNamedAccess();
    await m.lowerNamedAccess(
      {
        hospital: null,
        position: "letters_only",
        reason: "Pausing names while we review",
        version: g.global.version,
        ...CODE,
      },
      KEY(),
    );
    const river = await switchOf(m, "h_riverside");
    expect(
      await failure(
        m.requestNamedAccess(
          {
            hospital: "h_riverside",
            position: "on",
            signoffs: SIGNOFFS,
            version: river.version,
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([409, "above_global"]);
  });

  it("lowering takes effect at once with one admin", async () => {
    const { m } = setup({ email: TEAM_EMAILS.tunde });
    const g = await m.getNamedAccess();
    const out = await m.lowerNamedAccess(
      {
        hospital: null,
        position: "letters_only",
        reason: "A complaint is being looked into",
        version: g.global.version,
        ...CODE,
      },
      KEY(),
    );
    expect(out.global.position).toBe("letters_only");
    expect(Date.parse(out.global.since!)).toBe(START);
    expect(out.global.history[0]).toMatchObject({
      from: "on",
      to: "letters_only",
      requested_by: null,
      approved_by: null,
      lowered_by: { id: "tm_tunde" },
      reason: "A complaint is being looked into",
      signoffs: null,
    });
    // It must lower, with a reason.
    for (const body of [
      { hospital: null, position: "letters_only" as const, reason: "Again" },
      { hospital: null, position: "on" as const, reason: "Up" },
      { hospital: null, position: "off" as const, reason: " " },
    ])
      expect(
        await failure(
          m.lowerNamedAccess(
            { ...body, version: out.global.version, ...CODE },
            KEY(),
          ),
        ),
      ).toEqual([422, "invalid"]);
    // An auditor can't.
    const { m: amara } = setup({ email: TEAM_EMAILS.amara });
    expect(
      await failure(
        amara.lowerNamedAccess(
          {
            hospital: "h_havana",
            position: "off",
            reason: "x",
            version: 1,
            ...CODE,
          },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
  });

  it("effective is the lower of global and hospital", async () => {
    const { m } = setup();
    const g = await m.getNamedAccess();
    const out = await m.lowerNamedAccess(
      {
        hospital: null,
        position: "letters_only",
        reason: "Review",
        version: g.global.version,
        ...CODE,
      },
      KEY(),
    );
    const havana = out.hospitals.find((h) => h.hospital.id === "h_havana")!;
    expect([havana.position, havana.effective]).toEqual(["on", "letters_only"]);
    const north = out.hospitals.find((h) => h.hospital.id === "h_northgate")!;
    expect([north.position, north.effective]).toEqual(["off", "off"]);
  });

  it("every action logs Activity", async () => {
    const { m, as } = setup();
    const c = await m.getClearance("cl_north");
    await m.getClearancePage("cl_north", 1);
    await m.rejectClearance(
      "cl_north",
      { reason: "not_leadership", version: c.version, ...CODE },
      KEY(),
    );
    const w = await m.getClearance("cl_wait");
    await m.verifyClearance("cl_wait", { version: w.version, ...CODE }, KEY());
    const a = await m.getClearance("cl_act");
    await m.revokeClearance(
      "cl_act",
      { reason: "person_left", version: a.version, ...CODE },
      KEY(),
    );
    as(TEAM_EMAILS.bola);
    const s = await m.getClearance("cl_soon");
    await failure(
      m.verifyClearance("cl_soon", { version: s.version, ...CODE }, KEY()),
    );
    as(TEAM_EMAILS.ada);
    const r1 = await switchOf(m, "h_riverside");
    let out = await m.requestNamedAccess(
      {
        hospital: "h_riverside",
        position: "on",
        signoffs: SIGNOFFS,
        version: r1.version,
        ...CODE,
      },
      KEY(),
    );
    let river = out.hospitals.find((h) => h.hospital.id === "h_riverside")!;
    out = await m.cancelNamedAccess(
      river.request!.id,
      { version: river.version },
      KEY(),
    );
    river = out.hospitals.find((h) => h.hospital.id === "h_riverside")!;
    out = await m.requestNamedAccess(
      {
        hospital: "h_riverside",
        position: "on",
        signoffs: SIGNOFFS,
        version: river.version,
        ...CODE,
      },
      KEY(),
    );
    river = out.hospitals.find((h) => h.hospital.id === "h_riverside")!;
    as(TEAM_EMAILS.tunde);
    out = await m.approveNamedAccess(
      river.request!.id,
      { version: river.version, ...CODE },
      KEY(),
    );
    await m.lowerNamedAccess(
      {
        hospital: null,
        position: "off",
        reason: "Pause",
        version: out.global.version,
        ...CODE,
      },
      KEY(),
    );
    const events = (await activity(m)).slice(0, 10).reverse();
    expect(events.map((e) => [e.action, e.target])).toEqual([
      ["clearance_viewed", "the clearance letter signed by Dr. Tayo Bankole"],
      ["clearance_rejected", "the clearance letter signed by Dr. Tayo Bankole"],
      ["clearance_verified", "the clearance letter signed by Dr. Funmi Ade"],
      ["clearance_revoked", "the clearance letter signed by Dr. Funmi Ade"],
      [
        "clearance_verify_refused",
        "the clearance letter signed by Dr. Funmi Ade",
      ],
      ["named_access_requested", "On for Riverside Children's Hospital"],
      ["named_access_cancelled", "On for Riverside Children's Hospital"],
      ["named_access_requested", "On for Riverside Children's Hospital"],
      ["named_access_approved", "On for Riverside Children's Hospital"],
      ["named_access_lowered", "Off for every hospital"],
    ]);
    expect(events[1]!.detail).toBe("Not signed by leadership");
    expect(events[3]!.detail).toBe("Person left or changed role");
    expect(events[9]!.detail).toBe("Pause");
  });

  it("the off option seeds global Off", async () => {
    const { m } = setup({ clearances: "off" });
    const s = await m.getNamedAccess();
    expect(s.global).toMatchObject({
      position: "off",
      since: null,
      history: [],
      request: null,
    });
    const havana = s.hospitals.find((h) => h.hospital.id === "h_havana")!;
    expect(havana.effective).toBe("off");
  });
});
