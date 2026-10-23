import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import type {
  ConnectionIn,
  ConnectionPatch,
  EmrConnection,
} from "./emr-contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform, type MockCore } from "./mock";
import { MOCK_CODE, createStepUp } from "./step-up";

const START = Date.parse("2026-10-23T09:30:00.000Z");
const MIN = 60_000;
let n = 0;
const KEY = () => ({ idempotencyKey: `emr-${++n}` });
const CODE = { mfa_code: MOCK_CODE };
const WRONG = { mfa_code: "000000" };
/** Typed secrets: none of them may ever come back. */
const SECRET = "SECRET-private-key-0001";
const SECRET2 = "SECRET-replaced-key-0002";

function setup(over: { email?: string | null } = {}) {
  let t = START;
  let me = over.email === undefined ? TEAM_EMAILS.ada : over.email;
  let core: MockCore | undefined;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    onCore: (c) => void (core = c),
  });
  return {
    m,
    core: () => core!,
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

const newConnection = (over: Partial<ConnectionIn> = {}): ConnectionIn => ({
  type: "fhir_r4",
  source_label: "Results system",
  base_url: "https://records.westfield.example/fhir",
  settings: { client_id: "mhai-westfield-2" },
  credentials: { private_key: SECRET },
  ...CODE,
  ...over,
});
const add = (m: Mock, over: Partial<ConnectionIn> = {}) =>
  m.addConnection("h_westfield", newConnection(over), KEY());
const events = async (m: Mock) => (await m.listActivity({})).events;

describe("mock record connections", () => {
  it("has the three connection types, named by standard or method", async () => {
    const { types } = await setup().m.listConnectorTypes();
    expect(types.map((t) => [t.id, t.label])).toEqual([
      ["fhir_r4", "FHIR R4 server"],
      ["hl7v2_feed", "Results message feed"],
      ["file_export", "Scheduled file export"],
    ]);
    expect(types[0]!.fields.map((f) => [f.key, f.label, f.kind])).toEqual([
      ["client_id", "Client ID", "text"],
      ["private_key", "Private key", "secret"],
    ]);
    for (const t of types)
      for (const f of t.fields) expect(f.key).toMatch(/^[a-z_]+$/);
  });

  it("lists every connection, with hospitals that have none as not connected", async () => {
    const out = await setup().m.listConnections({});
    expect(
      out.connections.map((c) => [c.id, c.hospital.name, c.source_label]),
    ).toEqual([
      ["emr_hv1", "Havana Hospital", "Main record"],
      ["emr_hv2", "Havana Hospital", "Results system"],
      ["emr_ng1", "Northgate General Hospital", "Patient record"],
      ["emr_rc1", "Riverside Children's Hospital", "Nightly export"],
      ["emr_wf1", "Westfield Clinic", "Main record"],
    ]);
    expect(out.not_connected.map((h) => h.name)).toEqual([
      "Eastbrook Medical Centre",
      "Harbour View Hospital",
      "Hilltop Cottage Hospital",
      "Lakeside Community Clinic",
      "Southpoint Hospital",
    ]);
    const hv1 = out.connections[0]!;
    expect(hv1).toMatchObject({
      type: "fhir_r4",
      type_label: "FHIR R4 server",
      enabled: true,
      health: "ok",
      last_sync: { ok: true, records: 1284 },
      errors_24h: 0,
    });
    expect(hv1.last_sync!.at).toBe(new Date(START - 2 * MIN).toISOString());
    // A summary carries no address, fields or credentials.
    expect(Object.keys(hv1)).not.toContain("base_url");
    expect(Object.keys(hv1)).not.toContain("credentials");
    const one = await setup().m.listConnections({ hospital: "h_havana" });
    expect(one.connections.map((c) => c.id)).toEqual(["emr_hv1", "emr_hv2"]);
    expect(one.not_connected).toEqual([]);
  });

  it("the state filter: needs attention is Northgate, off is Riverside and Westfield", async () => {
    const { m } = setup();
    const ids = async (state: "needs_attention" | "off" | "not_connected") =>
      (await m.listConnections({ state })).connections.map((c) => c.id);
    expect(await ids("needs_attention")).toEqual(["emr_ng1"]);
    expect(await ids("off")).toEqual(["emr_rc1", "emr_wf1"]);
    expect(await ids("not_connected")).toEqual([]);
    const nc = await m.listConnections({ state: "not_connected" });
    expect(nc.not_connected.map((h) => h.id)).toContain("h_eastbrook");
    expect(
      (await m.listConnections({ state: "needs_attention" })).not_connected,
    ).toEqual([]);
    const ng = await m.getConnection("emr_ng1");
    expect(ng.errors).toEqual([
      {
        at: new Date(START - 25 * MIN).toISOString(),
        code: "sign_in_refused",
        count: 3,
      },
    ]);
    expect(ng.errors_24h).toBe(3);
    expect(ng.last_sync).toEqual({
      at: new Date(START - 6 * 60 * MIN).toISOString(),
      ok: true,
      records: expect.any(Number),
    });
  });

  it("credentials read as set_at only", async () => {
    const { m } = setup();
    const hv = await m.getConnection("emr_hv1");
    expect(hv.credentials).toEqual([
      { key: "private_key", set_at: expect.any(String) },
    ]);
    expect(hv.settings).toEqual({ client_id: expect.any(String) });
    const wf = await m.getConnection("emr_wf1");
    expect(wf.credentials).toEqual([{ key: "private_key", set_at: null }]);
    expect(wf.base_url).toMatch(/^https:\/\/records\.westfield\.example\//);
  });

  it("add saves switched off and untested", async () => {
    const { m } = setup();
    const c = await add(m);
    expect(c).toMatchObject({
      hospital: { id: "h_westfield", name: "Westfield Clinic" },
      type: "fhir_r4",
      type_label: "FHIR R4 server",
      source_label: "Results system",
      enabled: false,
      health: "never",
      last_test: null,
      last_sync: null,
      errors: [],
      errors_24h: 0,
      settings: { client_id: "mhai-westfield-2" },
      credentials: [
        { key: "private_key", set_at: new Date(START).toISOString() },
      ],
      updated_by: { id: "tm_ada", name: "Ada Bakare" },
      version: 1,
    });
    expect(await m.getConnection(c.id)).toEqual(c);
    const list = await m.listConnections({ hospital: "h_westfield" });
    expect(list.connections.map((x) => x.source_label)).toEqual([
      "Main record",
      "Results system",
    ]);
  });

  it("refuses an unknown type, a bad address and missing fields", async () => {
    const { m } = setup();
    expect(await failure(add(m, { type: "nope" }))).toEqual([422, "no_type"]);
    for (const over of [
      { base_url: "http://records.westfield.example/" },
      { base_url: `https://a.example/${"x".repeat(500)}` },
      { source_label: "" },
      { source_label: "x".repeat(41) },
      { settings: {} },
      { settings: { client_id: "a", folder: "b" } },
      { credentials: {} },
      { credentials: { private_key: "x".repeat(4001) } },
      { credentials: { private_key: SECRET, access_key: "b" } },
    ] as Partial<ConnectionIn>[])
      expect(await failure(add(m, over)), JSON.stringify(over)).toEqual([
        422,
        "invalid",
      ]);
  });

  it("a removed hospital is hospital_removed", async () => {
    const { m, core } = setup();
    core().findHospital("h_eastbrook").hospital.status = "removed";
    expect(
      await failure(m.addConnection("h_eastbrook", newConnection(), KEY())),
    ).toEqual([409, "hospital_removed"]);
    expect(
      await failure(m.addConnection("h_nope", newConnection(), KEY())),
    ).toEqual([404, "not_found"]);
    // A removed hospital isn't listed as not connected.
    const { not_connected } = await m.listConnections({});
    expect(not_connected.map((h) => h.id)).not.toContain("h_eastbrook");
  });

  it("switching on without a passing test is not_tested", async () => {
    const { m } = setup();
    const wf = await m.getConnection("emr_wf1");
    expect(
      await failure(
        m.setConnectionEnabled(
          wf.id,
          { enabled: true, version: wf.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "not_tested"]);
    const c = await add(m);
    expect(
      await failure(
        m.setConnectionEnabled(
          c.id,
          { enabled: true, version: c.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "not_tested"]);
    // A failed test doesn't count either.
    const bad = await add(m, {
      source_label: "Spare",
      base_url: "https://records.westfield.example/fail",
    });
    await m.testConnection(bad.id, KEY());
    expect(
      await failure(
        m.setConnectionEnabled(
          bad.id,
          { enabled: true, version: bad.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "not_tested"]);
    // A pass does.
    const tested = await m.testConnection(c.id, KEY());
    expect(tested.last_test).toEqual({
      at: new Date(START).toISOString(),
      ok: true,
      code: null,
    });
    const on = await m.setConnectionEnabled(
      c.id,
      { enabled: true, version: tested.version, ...CODE },
      KEY(),
    );
    expect(on.enabled).toBe(true);
    expect(on.version).toBe(tested.version + 1);
  });

  it("switching off and on again; Riverside can be switched back on", async () => {
    const { m } = setup();
    const rc = await m.getConnection("emr_rc1");
    expect(rc.enabled).toBe(false);
    expect(rc.last_test?.ok).toBe(true);
    const on = await m.setConnectionEnabled(
      rc.id,
      { enabled: true, version: rc.version, ...CODE },
      KEY(),
    );
    expect(on.enabled).toBe(true);
    const off = await m.setConnectionEnabled(
      rc.id,
      { enabled: false, version: on.version, ...CODE },
      KEY(),
    );
    expect(off.enabled).toBe(false);
    expect((await events(m)).slice(0, 2).map((e) => e.action)).toEqual([
      "emr_connection_switched_off",
      "emr_connection_switched_on",
    ]);
  });

  it("an edit to the address clears the last test; a label-only edit keeps it", async () => {
    const { m } = setup();
    const hv = await m.getConnection("emr_hv1");
    const renamed = await m.updateConnection(
      hv.id,
      { source_label: "Main patient record", version: hv.version, ...CODE },
      KEY(),
    );
    expect(renamed.source_label).toBe("Main patient record");
    expect(renamed.last_test).toEqual(hv.last_test);
    expect(renamed.version).toBe(hv.version + 1);
    const moved = await m.updateConnection(
      hv.id,
      {
        base_url: "https://records.havana.example/fhir/r4",
        version: renamed.version,
        ...CODE,
      },
      KEY(),
    );
    expect(moved.base_url).toBe("https://records.havana.example/fhir/r4");
    expect(moved.last_test).toBeNull();
    // A connection that is on stays on.
    expect(moved.enabled).toBe(true);
    // Settings and a replaced credential clear it too.
    const rc = await m.getConnection("emr_rc1");
    const s = await m.updateConnection(
      rc.id,
      { settings: { folder: "/exports/new" }, version: rc.version, ...CODE },
      KEY(),
    );
    expect(s.last_test).toBeNull();
    const ng = await m.getConnection("emr_ng1");
    const k = await m.updateConnection(
      ng.id,
      { credentials: { private_key: SECRET2 }, version: ng.version, ...CODE },
      KEY(),
    );
    expect(k.last_test).toBeNull();
    expect(k.credentials).toEqual([
      { key: "private_key", set_at: new Date(START).toISOString() },
    ]);
  });

  it("refuses a bad edit", async () => {
    const { m } = setup();
    const hv = await m.getConnection("emr_hv1");
    for (const over of [
      { base_url: "http://records.havana.example/" },
      { source_label: " " },
      { settings: { client_id: "" } },
      { settings: { nope: "a" } },
      { credentials: { private_key: "" } },
      { credentials: { client_id: "a" } },
    ] as Partial<ConnectionPatch>[])
      expect(
        await failure(
          m.updateConnection(
            hv.id,
            { ...over, version: hv.version, ...CODE },
            KEY(),
          ),
        ),
        JSON.stringify(over),
      ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.updateConnection("emr_nope", { version: 1, ...CODE }, KEY()),
      ),
    ).toEqual([404, "not_found"]);
  });

  it("a stale version is conflict", async () => {
    const { m } = setup();
    const hv = await m.getConnection("emr_hv1");
    await m.updateConnection(
      hv.id,
      { source_label: "Main", version: hv.version, ...CODE },
      KEY(),
    );
    expect(
      await failure(
        m.updateConnection(
          hv.id,
          { source_label: "Other", version: hv.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(
        m.setConnectionEnabled(
          hv.id,
          { enabled: false, version: hv.version, ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([409, "conflict"]);
  });

  it("the same key replays the reply without doing it again", async () => {
    const { m } = setup();
    const key = KEY();
    const a = await m.addConnection("h_westfield", newConnection(), key);
    const b = await m.addConnection("h_westfield", newConnection(), key);
    expect(b).toEqual(a);
    const list = await m.listConnections({ hospital: "h_westfield" });
    expect(list.connections).toHaveLength(2);
  });

  it("an auditor can't add, edit, switch or test", async () => {
    const { m, as } = setup();
    const hv = await m.getConnection("emr_hv1");
    as(TEAM_EMAILS.amara);
    // ...but reads everything.
    expect((await m.listConnections({})).connections).toHaveLength(5);
    expect((await m.getConnection("emr_hv1")).id).toBe("emr_hv1");
    expect((await m.listConnectorTypes()).types).toHaveLength(3);
    // One at a time: each refusal is awaited before the next call.
    for (const p of [
      () => add(m),
      () =>
        m.updateConnection(
          hv.id,
          { source_label: "X", version: hv.version, ...CODE },
          KEY(),
        ),
      () =>
        m.setConnectionEnabled(
          hv.id,
          { enabled: false, version: hv.version, ...CODE },
          KEY(),
        ),
      () => m.testConnection(hv.id, KEY()),
    ])
      expect(await failure(p())).toEqual([403, "forbidden"]);
    as(null);
    expect(await failure(m.listConnections({}))).toEqual([
      401,
      "session_expired",
    ]);
  });

  it("every write but test refuses a wrong code with mfa_invalid", async () => {
    const { m } = setup();
    const hv = await m.getConnection("emr_hv1");
    for (const p of [
      () => add(m, WRONG),
      () =>
        m.updateConnection(
          hv.id,
          { source_label: "X", version: hv.version, ...WRONG },
          KEY(),
        ),
      () =>
        m.setConnectionEnabled(
          hv.id,
          { enabled: false, version: hv.version, ...WRONG },
          KEY(),
        ),
    ])
      expect(await failure(p())).toEqual([403, "mfa_invalid"]);
    // Test takes no code.
    const t = await m.testConnection(hv.id, KEY());
    expect(t.last_test?.ok).toBe(true);
    // Nothing changed.
    expect(await m.getConnection(hv.id)).toMatchObject({
      source_label: "Main record",
      enabled: true,
      version: hv.version,
    });
  });

  it("an address containing fail tests as sign_in_refused", async () => {
    const { m } = setup();
    const c = await add(m, {
      base_url: "https://records.westfield.example/fail",
    });
    const t = await m.testConnection(c.id, KEY());
    expect(t.last_test).toEqual({
      at: new Date(START).toISOString(),
      ok: false,
      code: "sign_in_refused",
    });
    // A test changes nothing a version guards.
    expect(t.version).toBe(c.version);
    // The fixtures' results are fixed: Northgate is refused, Havana passes.
    expect((await m.testConnection("emr_ng1", KEY())).last_test).toMatchObject({
      ok: false,
      code: "sign_in_refused",
    });
    expect((await m.testConnection("emr_hv2", KEY())).last_test?.ok).toBe(true);
    // Westfield has no private key yet: refused until one is set.
    expect((await m.testConnection("emr_wf1", KEY())).last_test).toMatchObject({
      ok: false,
      code: "sign_in_refused",
    });
    const wf = await m.getConnection("emr_wf1");
    await m.updateConnection(
      wf.id,
      { credentials: { private_key: SECRET }, version: wf.version, ...CODE },
      KEY(),
    );
    expect((await m.testConnection("emr_wf1", KEY())).last_test?.ok).toBe(true);
  });

  it("no reply ever contains a credential", async () => {
    const { m } = setup();
    const replies: unknown[] = [];
    const keep = <T>(v: T) => (replies.push(v), v);
    const c = keep(await add(m));
    const u = keep(
      await m.updateConnection(
        c.id,
        { credentials: { private_key: SECRET2 }, version: c.version, ...CODE },
        KEY(),
      ),
    ) as EmrConnection;
    const t = keep(await m.testConnection(c.id, KEY())) as EmrConnection;
    keep(
      await m.setConnectionEnabled(
        c.id,
        { enabled: true, version: t.version, ...CODE },
        KEY(),
      ),
    );
    expect(u.version).toBe(c.version + 1);
    keep(await m.getConnection(c.id));
    keep(await m.listConnections({}));
    keep(await events(m));
    const all = JSON.stringify(replies);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(SECRET2);
    expect(all).not.toContain("SECRET-");
  });

  it("each write is in Activity with the source label and never a secret", async () => {
    const { m } = setup();
    const c = await add(m);
    const u = await m.updateConnection(
      c.id,
      {
        source_label: "Lab results",
        credentials: { private_key: SECRET2 },
        version: c.version,
        ...CODE,
      },
      KEY(),
    );
    const plain = await m.updateConnection(
      c.id,
      { source_label: "Lab feed", version: u.version, ...CODE },
      KEY(),
    );
    const t = await m.testConnection(c.id, KEY());
    const on = await m.setConnectionEnabled(
      c.id,
      { enabled: true, version: t.version, ...CODE },
      KEY(),
    );
    await m.setConnectionEnabled(
      c.id,
      { enabled: false, version: on.version, ...CODE },
      KEY(),
    );
    expect(plain.version).toBe(u.version + 1);
    const westfield = { id: "h_westfield", name: "Westfield Clinic" };
    const ada = { id: "tm_ada", name: "Ada Bakare" };
    const mine = (await events(m)).slice(0, 6).reverse();
    expect(
      mine.map((e) => [e.action, e.target, e.detail, e.hospital, e.actor]),
    ).toEqual([
      ["emr_connection_added", "Results system", null, westfield, ada],
      [
        "emr_connection_changed",
        "Lab results",
        "Credentials replaced",
        westfield,
        ada,
      ],
      ["emr_connection_changed", "Lab feed", null, westfield, ada],
      ["emr_connection_tested", "Lab feed", null, westfield, ada],
      ["emr_connection_switched_on", "Lab feed", null, westfield, ada],
      ["emr_connection_switched_off", "Lab feed", null, westfield, ada],
    ]);
    expect(JSON.stringify(mine)).not.toContain("SECRET-");
    // The hospital's own feed has them too.
    const hosp = await m.listActivity({ hospital: "h_westfield" });
    expect(hosp.events[0]!.action).toBe("emr_connection_switched_off");
  });

  it("errors older than 24 hours drop out", async () => {
    const { m, advance } = setup();
    advance(24 * 60 * MIN);
    const ng = await m.getConnection("emr_ng1");
    expect(ng.errors).toEqual([]);
    expect(ng.errors_24h).toBe(0);
  });
});
