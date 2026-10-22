import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  readAuditEvent,
  readAuditList,
  readDetail,
  readExportList,
  readNamedAccess,
  readRun,
  readRunList,
  readStatus,
} from "@/lib/audit/read";
import { integrityOf } from "@/lib/audit/integrity";
import {
  TooManyRowsError,
  type AuditFilters,
  type ExportIn,
} from "./audit-contract";
import { TEAM_EMAILS } from "./fixtures";
import { createMockPlatform, type MockCore } from "./mock";
import type { AuditMockOptions } from "./mock-audit";
import { MOCK_CODE, createStepUp } from "./step-up";
import { crc32, storedZip } from "./demo-zip";

const START = Date.parse("2026-10-22T09:30:00.000Z");
let n = 0;
const KEY = () => ({ idempotencyKey: `ka-${++n}` });
const CODE = { mfa_code: MOCK_CODE };

function setup(
  audit?: AuditMockOptions,
  email: string | null = TEAM_EMAILS.ada,
) {
  let t = START;
  let me = email;
  let core!: MockCore;
  const m = createMockPlatform({
    now: () => t,
    me: () => me,
    delayMs: 0,
    stepUp: createStepUp(() => t),
    audit,
    onCore: (c) => (core = c),
  });
  return {
    m,
    core,
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

const EXPORT: ExportIn = {
  kind: "events",
  filters: { type: ["sign_in"] },
  reason: "legal_request",
  ...CODE,
};

/** Every event of a list read strictly; all must be displayable. */
function allEvents(
  raw: Awaited<ReturnType<ReturnType<typeof setup>["m"]["listAudit"]>>,
) {
  const list = readAuditList(raw);
  expect(list.events.every((r) => r.ok)).toBe(true);
  return raw.events;
}

describe("the sample log", () => {
  it("events come newest first in pages of 50, with total and oldest_kept_at", async () => {
    const { m } = setup();
    const a = await m.listAudit({});
    expect(a.events).toHaveLength(50);
    const seqs = a.events.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((x, y) => y - x));
    expect(a.total).toBeGreaterThan(220);
    expect(a.total).toBeLessThan(260);
    expect(a.total_capped).toBe(false);
    expect(a.next_cursor).not.toBeNull();
    expect(a.last_checkpoint?.id).toBe("cp_2026_10");
    expect(a.oldest_kept_at).toBe(a.last_checkpoint!.before);
    expect(a.last_checkpoint).toMatchObject({ purged_count: 412_006 });
    // The oldest entry is 9,880,000, about 13 months back.
    let cursor = a.next_cursor;
    let last = a;
    while (cursor) {
      last = await m.listAudit({}, cursor);
      cursor = last.next_cursor;
    }
    const oldest = last.events[last.events.length - 1];
    expect(oldest.seq).toBe(9_880_000);
    expect(Date.parse(oldest.at)).toBeGreaterThan(START - 430 * 86_400_000);
    expect(Date.parse(a.oldest_kept_at)).toBeLessThan(Date.parse(oldest.at));
  });

  it("names every demo hospital and Old Mill, removed", async () => {
    const { m } = setup();
    const { hospitals } = await m.listAuditHospitals();
    expect(hospitals.map((h) => h.id)).toEqual(
      expect.arrayContaining([
        "h_havana",
        "h_northgate",
        "h_westfield",
        "h_oldmill",
      ]),
    );
    expect(hospitals.find((h) => h.id === "h_oldmill")).toEqual({
      id: "h_oldmill",
      name: "Old Mill Clinic",
      removed: true,
    });
    const all = await everything(m);
    expect(new Set(all.map((e) => e.hospital?.id))).toContain("h_oldmill");
    expect(
      all.some((e) => e.kind === "sign_in_locked" && e.flag === "security"),
    ).toBe(true);
    expect(
      all.some(
        (e) => e.kind === "own_role_change_refused" && e.flag === "security",
      ),
    ).toBe(true);
    expect(
      all.some(
        (e) => e.kind === "sign_in_refused" && e.reason === "wrong_code",
      ),
    ).toBe(true);
    expect(
      all.find(
        (e) =>
          e.kind === "hospital_deactivated" && e.hospital?.id === "h_westfield",
      )?.reason,
    ).toBe("contract_ended");
    expect(
      all.some(
        (e) => e.kind === "hospital_removed" && e.hospital?.id === "h_oldmill",
      ),
    ).toBe(true);
  });

  it("holds three named drill-downs at Northgate under one active letter", async () => {
    const { m } = setup();
    const { events } = await m.listAudit({ type: ["named_access"] });
    const named = events.filter((e) => e.kind === "drilldown_named");
    expect(named).toHaveLength(3);
    for (const e of named) {
      expect(e.hospital?.id).toBe("h_northgate");
      expect(e.refs.clearance_id).toBe("cl_northgate_2026");
      const { pseudonyms } = await m.getAuditPatients(e.id);
      expect(pseudonyms.length).toBeGreaterThanOrEqual(3);
      expect(pseudonyms.length).toBeLessThanOrEqual(12);
      expect(pseudonyms.length).toBe(e.facts.patient_count);
      for (const p of pseudonyms) expect(p).toMatch(/^p_ng_[0-9a-f]{6}$/);
    }
    const d = await m.getAuditEvent(named[0].id);
    expect(d.letter).toMatchObject({
      id: "cl_northgate_2026",
      status: "active",
      verified_by: { name: "Tunde Okafor" },
    });
  });

  it("fingerprints are 64 hex and differ by entry", async () => {
    const { m } = setup();
    const { events } = await m.listAudit({});
    expect(new Set(events.map((e) => e.hash)).size).toBe(events.length);
    for (const e of events) expect(e.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

async function everything(
  m: ReturnType<typeof setup>["m"],
  f: AuditFilters = {},
) {
  const out = [];
  let cursor: string | null | undefined;
  do {
    const r = await m.listAudit(f, cursor ?? undefined);
    out.push(...r.events);
    cursor = r.next_cursor;
  } while (cursor);
  return out;
}

describe("reading the log", () => {
  it("each filter narrows: hospital, platform, person, types, outcome, flagged, dates", async () => {
    const { m } = setup();
    const all = await everything(m);
    const ng = await everything(m, { hospital: "h_northgate" });
    expect(ng.length).toBeGreaterThan(0);
    expect(ng.length).toBeLessThan(all.length);
    expect(ng.every((e) => e.hospital?.id === "h_northgate")).toBe(true);
    const plat = await everything(m, { hospital: "platform" });
    expect(plat.length).toBeGreaterThan(0);
    expect(plat.every((e) => e.hospital === null)).toBe(true);
    const ada = await everything(m, { person: "tm_ada" });
    expect(ada.length).toBeGreaterThan(0);
    expect(ada.every((e) => e.actor.id === "tm_ada")).toBe(true);
    const types = await everything(m, { type: ["sign_in", "security"] });
    expect(
      types.every((e) => e.type === "sign_in" || e.type === "security"),
    ).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    const refused = await everything(m, { outcome: "refused" });
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((e) => e.outcome === "refused")).toBe(true);
    const flagged = await everything(m, { flagged: true });
    expect(flagged.length).toBeGreaterThanOrEqual(2);
    expect(flagged.every((e) => e.flag !== null)).toBe(true);
    const from = new Date(START - 30 * 86_400_000).toISOString();
    const to = new Date(START - 10 * 86_400_000).toISOString();
    const dated = await everything(m, { from, to });
    expect(dated.length).toBeGreaterThan(0);
    expect(
      dated.every(
        (e) =>
          Date.parse(e.at) >= Date.parse(from) &&
          Date.parse(e.at) < Date.parse(to),
      ),
    ).toBe(true);
    const none = await m.listAudit({ q: "ev_1" });
    expect(none.events).toEqual([]);
    expect(none.total).toBe(0);
  });

  it("q finds an event by request id and by pseudonym", async () => {
    const { m } = setup();
    const { events } = await m.listAudit({});
    const one = events[3];
    const byId = await m.listAudit({ q: one.id });
    expect(byId.events.map((e) => e.id)).toEqual([one.id]);
    const byReq = await m.listAudit({ q: one.refs.request_id! });
    expect(byReq.events.map((e) => e.id)).toContain(one.id);
    const named = (await m.listAudit({ type: ["named_access"] })).events.find(
      (e) => e.kind === "drilldown_named",
    )!;
    const [p] = (await m.getAuditPatients(named.id)).pseudonyms;
    const byP = await m.listAudit({ q: p });
    expect(byP.events.map((e) => e.id)).toContain(named.id);
    expect(byP.events.every((e) => e.kind === "drilldown_named")).toBe(true);
  });

  it("a new filter set adds one audit_viewed; Load more and the same set add none", async () => {
    const { m } = setup();
    const views = async () =>
      (await m.listAudit({ type: ["audit"] })).events.filter(
        (e) =>
          e.kind === "audit_viewed" &&
          e.actor.id === "tm_ada" &&
          e.at === new Date(START).toISOString(),
      ).length;
    const first = await m.listAudit({});
    expect(await views()).toBe(1); // this call's own set ({type:audit}) is the 2nd
    // Load more adds nothing.
    await m.listAudit({}, first.next_cursor!);
    await m.listAudit({}, first.next_cursor!);
    const base = (await m.listAudit({ type: ["audit"] })).total;
    // Same set again: nothing.
    await m.listAudit({ type: ["audit"] });
    expect((await m.listAudit({ type: ["audit"] })).total).toBe(base);
    // A different set: one.
    await m.listAudit({ flagged: true });
    expect((await m.listAudit({ type: ["audit"] })).total).toBe(base + 1);
  });

  it("a pseudonym search adds audit_searched with searched_kind pseudonym", async () => {
    const { m } = setup();
    const named = (await m.listAudit({ type: ["named_access"] })).events.find(
      (e) => e.kind === "drilldown_named",
    )!;
    const [p] = (await m.getAuditPatients(named.id)).pseudonyms;
    await m.listAudit({ q: p });
    const { events } = await m.listAudit({ type: ["audit"] });
    const s = events.find((e) => e.kind === "audit_searched");
    expect(s?.facts).toMatchObject({ searched: p, searched_kind: "pseudonym" });
    expect(s?.facts.filters).toBeUndefined();
  });

  it("opening an event and showing patient ids each add an entry", async () => {
    const { m } = setup();
    const named = (await m.listAudit({ type: ["named_access"] })).events.find(
      (e) => e.kind === "drilldown_named",
    )!;
    await m.getAuditEvent(named.id);
    await m.getAuditPatients(named.id);
    const { events } = await m.listAudit({ type: ["audit"] });
    expect(events.find((e) => e.kind === "audit_event_opened")?.target).toEqual(
      { kind: "event", id: named.id },
    );
    expect(
      events.find((e) => e.kind === "audit_patients_viewed")?.target,
    ).toEqual({ kind: "event", id: named.id });
    expect(await failure(m.getAuditEvent("ev_nope"))).toEqual([
      404,
      "not_found",
    ]);
    const plain = (await m.listAudit({})).events.find(
      (e) => e.kind !== "drilldown_named",
    )!;
    expect(await failure(m.getAuditPatients(plain.id))).toEqual([
      404,
      "not_found",
    ]);
  });

  it("people search needs 2 characters", async () => {
    const { m } = setup();
    expect(await failure(m.searchAuditPeople("a"))).toEqual([422, "invalid"]);
    expect(await failure(m.searchAuditPeople(" a "))).toEqual([422, "invalid"]);
    const { people } = await m.searchAuditPeople("OKAFOR");
    expect(people.map((p) => p.id)).toEqual(["tm_tunde"]);
    expect((await m.searchAuditPeople("bakare")).people[0].id).toBe("tm_ada");
    expect(
      (await m.searchAuditPeople("measured-health.example")).people.length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (await m.searchAuditPeople("chidi")).people.map((p) => p.id),
    ).toEqual(["tm_new"]);
  });

  it("reads need someone signed in, of either role", async () => {
    const { m, as } = setup();
    as(null);
    expect(await failure(m.listAudit({}))).toEqual([401, "session_expired"]);
    as(TEAM_EMAILS.amara);
    expect((await m.listAudit({})).events).toHaveLength(50);
  });

  it("unavailable makes every audit read 503", async () => {
    const { m } = setup({ unavailable: true });
    for (const p of [
      m.listAudit({}),
      m.getAuditEvent("ev_9880000"),
      m.getAuditPatients("ev_9880000"),
      m.searchAuditPeople("ab"),
      m.listAuditHospitals(),
      m.listNamedAccess({}),
      m.listExports(),
      m.getIntegrityStatus(),
      m.listRuns(),
      m.getRun("run_s0"),
    ])
      expect(await failure(p)).toEqual([503, "unavailable"]);
  });

  it("matchCount overrides the total", async () => {
    const { m } = setup({ matchCount: 62_310 });
    const a = await m.listAudit({});
    expect(a.total).toBe(62_310);
    expect(a.total_capped).toBe(true);
  });
});

describe("exports", () => {
  it("an export needs a reason, a note for Other (≤ 200) and a code", async () => {
    const { m } = setup();
    expect(
      await failure(
        m.createExport(
          { ...EXPORT, mfa_code: undefined } as unknown as ExportIn,
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(m.createExport({ ...EXPORT, mfa_code: "000000" }, KEY())),
    ).toEqual([403, "mfa_invalid"]);
    expect(
      await failure(
        m.createExport({ ...EXPORT, reason: "bogus" as never }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(m.createExport({ ...EXPORT, reason: "other" }, KEY())),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.createExport(
          { ...EXPORT, reason: "other", note: "x".repeat(201) },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.createExport({ ...EXPORT, reference: "r".repeat(61) }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    const ok = await m.createExport(
      {
        ...EXPORT,
        reason: "other",
        note: "x".repeat(200),
        reference: "r".repeat(60),
      },
      KEY(),
    );
    expect(ok.export_id).toMatch(/^exp_/);
    // Named access needs a hospital and a clearance or dates.
    const named = { ...EXPORT, kind: "named_access" as const };
    expect(
      await failure(m.createExport({ ...named, filters: {} }, KEY())),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.createExport(
          { ...named, filters: { hospital: "h_northgate" } },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.createExport(
          { ...named, filters: { clearance: "cl_northgate_2026" } },
          KEY(),
        ),
      ),
    ).toEqual([422, "invalid"]);
  });

  it("an export over 50,000 rows is TooManyRowsError (matchCount 62,310)", async () => {
    const { m } = setup({ matchCount: 62_310 });
    const err = await m.createExport(EXPORT, KEY()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TooManyRowsError);
    expect(err).toMatchObject({
      status: 422,
      code: "too_many_rows",
      rows: 62_310,
    });
    // Nothing was written.
    const { events } = await m.listAudit({ type: ["export"] });
    expect(
      events.some(
        (e) =>
          e.id &&
          e.kind === "audit_exported" &&
          e.actor.id === "tm_ada" &&
          e.at === new Date(START).toISOString(),
      ),
    ).toBe(false);
  });

  it("the export entry is written before the reply", async () => {
    const { m } = setup();
    const out = await m.createExport(
      { ...EXPORT, reference: "CASE-17" },
      KEY(),
    );
    const { events } = await m.listAudit({ type: ["export"] });
    const e = events.find((x) => x.refs.export_id === out.export_id)!;
    expect(e.kind).toBe("audit_exported");
    expect(e.reason).toBe("legal_request");
    expect(e.target).toEqual({ kind: "export", id: out.export_id });
    expect(e.facts.rows).toBe(out.rows);
    const list = await m.listExports();
    expect(list.exports[0]).toMatchObject({
      id: out.export_id,
      rows: out.rows,
      reference: "CASE-17",
      downloaded_at: null,
      by: { id: "tm_ada" },
    });
    expect(list.exports).toHaveLength(3);
    expect(Date.parse(out.expires_at)).toBe(START + 15 * 60_000);
    expect(out.file_name).toMatch(
      /^audit-events-exp_m\d+-20261022-0930Z\.csv$/,
    );
  });

  it("an export replays on the same key, without a second file", async () => {
    const { m } = setup();
    const k = KEY();
    const a = await m.createExport(EXPORT, k);
    const b = await m.createExport(EXPORT, k);
    expect(b).toEqual(a);
    expect((await m.listExports()).exports).toHaveLength(3);
  });

  it("the file starts with Demo and the export id, and its checksum matches", async () => {
    const { m } = setup();
    const out = await m.createExport(EXPORT, KEY());
    const blob = await m.downloadExport(out.export_id);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe(out.checksum);
    const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    const lines = text.split("\r\n");
    expect(lines[0]).toMatch(/^Demo,/);
    expect(lines[1]).toBe(`Export id,${out.export_id}`);
    expect(text).toContain("Position,Fingerprint");
  });

  it("a second download is 410 gone and adds a refused entry", async () => {
    const { m } = setup();
    const out = await m.createExport(EXPORT, KEY());
    await m.downloadExport(out.export_id);
    expect(await failure(m.downloadExport(out.export_id))).toEqual([
      410,
      "gone",
    ]);
    const { events } = await m.listAudit({ type: ["export"] });
    const mine = events
      .filter((e) => e.refs.export_id === out.export_id)
      .map((e) => e.kind);
    expect(mine).toEqual(
      expect.arrayContaining([
        "export_downloaded",
        "export_download_refused",
        "audit_exported",
      ]),
    );
    const refused = events.find((e) => e.kind === "export_download_refused")!;
    expect(refused).toMatchObject({ outcome: "refused", reason: "gone" });
    expect((await m.listExports()).exports[0].downloaded_at).not.toBeNull();
    expect(await failure(m.downloadExport("exp_none"))).toEqual([
      404,
      "not_found",
    ]);
  });

  it("only the person who made an export may download it; anyone else is 403, recorded as refused", async () => {
    const { m, as } = setup();
    const out = await m.createExport(EXPORT, KEY());
    as(TEAM_EMAILS.tunde);
    expect(await failure(m.downloadExport(out.export_id))).toEqual([
      403,
      "forbidden",
    ]);
    as(TEAM_EMAILS.amara);
    expect(await failure(m.downloadExport(out.export_id))).toEqual([
      403,
      "forbidden",
    ]);
    // Every entry still reads, the new refusal reason included.
    const events = allEvents(await m.listAudit({ type: ["export"] }));
    const refused = events.filter(
      (e) =>
        e.refs.export_id === out.export_id &&
        e.kind === "export_download_refused",
    );
    expect(refused).toHaveLength(2);
    expect(refused[0]).toMatchObject({
      outcome: "refused",
      reason: "not_owner",
    });
    expect(refused.map((e) => e.actor.id).sort()).toEqual([
      "tm_amara",
      "tm_tunde",
    ]);
    // Still there for its maker, once.
    as(TEAM_EMAILS.ada);
    expect((await m.listExports()).exports[0].downloaded_at).toBeNull();
    await expect(m.downloadExport(out.export_id)).resolves.toBeInstanceOf(Blob);
  });

  it("exportCap caps the file: rows stop there and capped shows in the reply, the entry, the record and the file", async () => {
    const { m } = setup({ exportCap: 3 });
    const out = await m.createExport({ ...EXPORT, filters: {} }, KEY());
    expect(out).toMatchObject({ rows: 3, capped: true });
    const { events } = await m.listAudit({ type: ["export"] });
    const e = events.find((x) => x.refs.export_id === out.export_id)!;
    expect(e.facts).toMatchObject({ rows: 3, capped: true });
    expect((await m.listExports()).exports[0]).toMatchObject({
      rows: 3,
      capped: true,
    });
    const text = new TextDecoder()
      .decode(
        new Uint8Array(
          await (await m.downloadExport(out.export_id)).arrayBuffer(),
        ),
      )
      .replace(/^\uFEFF/, "");
    expect(text).toContain("\r\nCapped,Yes\r\n");
    const table = text.slice(text.indexOf("Position,"));
    // The header row and three entries.
    expect(table.trim().split("\r\n")).toHaveLength(4);
  });

  it("a download after 15 minutes is 410", async () => {
    const { m, advance } = setup();
    const out = await m.createExport(EXPORT, KEY());
    advance(15 * 60_000);
    expect(await failure(m.downloadExport(out.export_id))).toEqual([
      410,
      "gone",
    ]);
    // The sample past exports are long gone.
    expect(await failure(m.downloadExport("exp_s1"))).toEqual([410, "gone"]);
  });

  it("the named-access export is a ZIP holding the CSV and the letters", async () => {
    const { m } = setup();
    const out = await m.createExport(
      {
        kind: "named_access",
        filters: { hospital: "h_northgate", clearance: "cl_northgate_2026" },
        reason: "regulator_request",
        ...CODE,
      },
      KEY(),
    );
    expect(out.file_name).toMatch(
      /^audit-named-access-exp_m\d+-20261022-0930Z\.zip$/,
    );
    expect(out.rows).toBe(3 + 0);
    const { events } = await m.listAudit({ type: ["export"] });
    expect(
      events.find((e) => e.kind === "named_access_exported")?.refs.export_id,
    ).toBe(out.export_id);
    const blob = await m.downloadExport(out.export_id);
    expect(blob.type).toBe("application/zip");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain(`${out.file_name.replace(".zip", ".csv")}`);
    expect(text).toContain("letter-cl_northgate_2026.txt");
    expect(text).toContain("p_ng_");
    // The end record counts two files.
    expect(dv.getUint16(bytes.length - 22 + 10, true)).toBe(2);
    // The sha-256 of the zip matches.
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    expect(
      [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    ).toBe(out.checksum);
  });
});

describe("the demo zip", () => {
  it("writes stored entries with a CRC-32, a central directory and an end record", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const a = new TextEncoder().encode("hello");
    const z = storedZip([{ name: "a.txt", data: a }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint16(8, true)).toBe(0);
    expect(dv.getUint32(14, true)).toBe(crc32(a));
    expect(dv.getUint32(18, true)).toBe(5);
    const end = z.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 8, true)).toBe(1);
    const dir = dv.getUint32(end + 16, true);
    expect(dv.getUint32(dir, true)).toBe(0x02014b50);
    expect(dv.getUint32(dir + 42, true)).toBe(0);
  });
});

describe("integrity", () => {
  const status = async (m: ReturnType<typeof setup>["m"]) =>
    readStatus(await m.getIntegrityStatus());

  it("intact: the latest run is the last 06:00 UTC, from the checkpoint to the newest entry", async () => {
    const { m } = setup();
    const s = await status(m);
    expect(s.latest).toMatchObject({
      started_at: "2026-10-22T06:00:00.000Z",
      by: null,
      state: "intact",
      from_checkpoint: { id: "cp_2026_10" },
    });
    expect(s.open_failure).toBeNull();
    expect(integrityOf(s.latest!, START)).toBe("intact");
    const top = (await m.listAudit({})).events[0].seq;
    expect(s.latest!.to_seq!).toBeLessThanOrEqual(top);
    expect(s.latest!.entries_checked).toBeGreaterThan(1_000_000);
    expect(s.oldest_kept_at).toBe(s.latest!.from_checkpoint!.before);
  });

  it("stale: the same run, 30 hours old", async () => {
    const { m } = setup({ integrity: "stale" });
    const s = await status(m);
    expect(START - Date.parse(s.latest!.finished_at!)).toBe(30 * 3_600_000);
    expect(integrityOf(s.latest!, START)).toBe("couldnt_check");
  });

  it("startCheck returns the running run while one runs, then finishes intact with a full range", async () => {
    const { m, advance } = setup();
    const a = await m.startCheck(KEY());
    const b = await m.startCheck(KEY());
    expect(b.run_id).toBe(a.run_id);
    const mid = readStatus(await m.getIntegrityStatus());
    expect(mid.running).toMatchObject({ id: a.run_id, state: "running" });
    expect(mid.latest?.id).toBe("run_s0");
    advance(750);
    const half = readStatus(await m.getIntegrityStatus());
    expect(half.running!.entries_checked!).toBeGreaterThan(
      mid.running!.entries_checked!,
    );
    advance(750);
    const done = readStatus(await m.getIntegrityStatus());
    expect(done.running).toBeNull();
    expect(done.latest).toMatchObject({
      id: a.run_id,
      state: "intact",
      from_checkpoint: { id: "cp_2026_10" },
      by: { id: "tm_ada" },
    });
    expect(integrityOf(done.latest!, START + 1500)).toBe("intact");
    expect(done.latest!.entries_checked).toBeGreaterThan(0);
    const { events } = await m.listAudit({ type: ["audit"] });
    expect(
      events.find(
        (e) =>
          e.kind === "audit_check_run" &&
          e.target?.kind === "run" &&
          e.target.id === a.run_id,
      ),
    ).toBeDefined();
    const runs = readRunList(await m.listRuns());
    expect(runs.runs[0].id).toBe(a.run_id);
    expect(readRun(await m.getRun(a.run_id)).state).toBe("intact");
    // A new one can start now.
    expect((await m.startCheck(KEY())).run_id).not.toBe(a.run_id);
  });

  it("broken mode marks events after the break and sets open_failure", async () => {
    const { core, m } = (() => {
      const s = setup({ integrity: "broken" });
      return s;
    })();
    void core;
    const s = await status(m);
    const all = await everything(m);
    const newest = all[0].seq;
    expect(s.open_failure).toMatchObject({
      state: "broken",
      first_broken_seq: newest - 40 + 0,
    });
    const brokenFrom = s.open_failure!.first_broken_seq!;
    expect(
      all.filter((e) => e.after_break).every((e) => e.seq >= brokenFrom),
    ).toBe(true);
    expect(
      all.filter((e) => e.seq >= brokenFrom).every((e) => e.after_break),
    ).toBe(true);
    expect(
      all.filter((e) => e.seq < brokenFrom).some((e) => e.after_break),
    ).toBe(false);
    expect(integrityOf(s.latest!, START)).toBe("broken");
    expect(s.latest!.to_seq).toBeNull();
  });

  it("broken mode has one notification for the bell", async () => {
    const { m } = setup({ integrity: "broken" });
    const run = (await m.getIntegrityStatus()).latest!;
    // The mock exposes its items to Task 4 through `notifications()`.
    const items = (
      m as unknown as { notifications(): unknown[] }
    ).notifications();
    expect(items).toEqual([
      expect.objectContaining({
        kind: "audit_integrity",
        run_id: run.id,
        first_broken_seq: run.first_broken_seq,
        seen: false,
      }),
    ]);
    const ok = setup();
    expect(
      (ok.m as unknown as { notifications(): unknown[] }).notifications(),
    ).toEqual([]);
  });

  it("error mode: runs finish as error, timed_out", async () => {
    const { m, advance } = setup({ integrity: "error" });
    await m.startCheck(KEY());
    advance(1500);
    const s = await status(m);
    expect(s.latest).toMatchObject({ state: "error", error_code: "timed_out" });
    expect(integrityOf(s.latest!, START + 1500)).toBe("couldnt_check");
  });

  it("unproven mode finishes with entries_checked 0", async () => {
    const { m, advance } = setup({ integrity: "unproven" });
    await m.startCheck(KEY());
    advance(1500);
    const s = await status(m);
    expect(s.latest).toMatchObject({ state: "intact", entries_checked: 0 });
    expect(integrityOf(s.latest!, START + 1500)).toBe("couldnt_check");
  });

  it("only an auditor adds an outcome, and only to a broken run", async () => {
    const { m, as } = setup({ integrity: "broken" });
    const run = await m.getRun("run_s0");
    expect(run.state).toBe("broken");
    const body = {
      note: "Looked into it; restoring from the backup.",
      version: run.version,
    };
    expect(await failure(m.addOutcome(run.id, body, KEY()))).toEqual([
      403,
      "forbidden",
    ]);
    as(TEAM_EMAILS.amara);
    expect(
      await failure(m.addOutcome(run.id, { ...body, note: "" }, KEY())),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(
        m.addOutcome(run.id, { ...body, note: "n".repeat(1001) }, KEY()),
      ),
    ).toEqual([422, "invalid"]);
    expect(
      await failure(m.addOutcome(run.id, { ...body, version: 9 }, KEY())),
    ).toEqual([409, "conflict"]);
    expect(
      await failure(m.addOutcome("run_s1", { note: "x", version: 1 }, KEY())),
    ).toEqual([409, "conflict"]);
    expect(await failure(m.addOutcome("run_none", body, KEY()))).toEqual([
      404,
      "not_found",
    ]);
    const done = await m.addOutcome(run.id, body, KEY());
    expect(done.outcome).toMatchObject({
      note: body.note,
      by: { id: "tm_amara" },
    });
    expect(done.version).toBe(run.version + 1);
    expect(readRun(done).state).toBe("broken");
    const { events } = await m.listAudit({ type: ["audit"] });
    expect(
      events.find((e) => e.kind === "audit_check_outcome")?.target,
    ).toEqual({ kind: "run", id: run.id });
    // The failure stays open.
    expect((await m.getIntegrityStatus()).open_failure?.id).toBe(run.id);
  });
});

describe("audit writes and roles", () => {
  it("an auditor's audit writes are allowed; their hospital writes are still 403", async () => {
    const { m, as } = setup();
    as(TEAM_EMAILS.amara);
    const out = await m.createExport(EXPORT, KEY());
    expect(out.export_id).toMatch(/^exp_/);
    await m.startCheck(KEY());
    await m.reportUndisplayable(["ev_9880001"], KEY());
    expect(await failure(m.reportUndisplayable([], KEY()))).toEqual([
      422,
      "invalid",
    ]);
    expect(await failure(m.reportUndisplayable(["bad id"], KEY()))).toEqual([
      422,
      "invalid",
    ]);
    const { events } = await m.listAudit({ type: ["audit"] });
    expect(
      events.find((e) => e.kind === "audit_undisplayable_reported")?.target,
    ).toEqual({ kind: "event", id: "ev_9880001" });
    expect(
      await failure(
        m.deactivate(
          "h_havana",
          { reason: "other", note: "x", ...CODE },
          KEY(),
        ),
      ),
    ).toEqual([403, "forbidden"]);
    as(null);
    expect(await failure(m.startCheck(KEY()))).toEqual([
      401,
      "session_expired",
    ]);
  });

  it("the bad option adds two events that readAuditEvent refuses", async () => {
    const good = setup();
    const base = (await good.m.listAudit({})).total;
    const { m } = setup({ bad: true });
    const all = await everything(m);
    expect(all).toHaveLength(base + 2);
    const refused = all.filter((e) => !readAuditEvent(e).ok);
    expect(refused).toHaveLength(2);
    expect(
      refused.some((e) => e.target?.kind === "patient" && "name" in e.target),
    ).toBe(true);
    expect(refused.some((e) => e.kind === "signed_in" && e.note !== null)).toBe(
      true,
    );
    expect(all.filter((e) => readAuditEvent(e).ok)).toHaveLength(base);
  });
});

describe("the reader accepts every reply", () => {
  it("events across the filters, detail, patients, named access, exports and runs all read", async () => {
    for (const integrity of [
      "intact",
      "broken",
      "stale",
      "error",
      "unproven",
    ] as const) {
      const { m, advance } = setup({ integrity });
      const filters: AuditFilters[] = [
        {},
        { hospital: "h_northgate" },
        { hospital: "platform" },
        { person: "tm_tunde" },
        { type: ["sign_in", "retention", "audit", "export", "named_access"] },
        { outcome: "refused" },
        { flagged: true },
        {
          from: new Date(START - 60 * 86_400_000).toISOString(),
          to: new Date(START).toISOString(),
        },
      ];
      for (const f of filters) {
        allEvents(await m.listAudit(f));
        for (const e of await everything(m, f))
          expect(readAuditEvent(e).ok).toBe(true);
      }
      // Session entries read too.
      const named = (await m.listAudit({ type: ["named_access"] })).events.find(
        (e) => e.kind === "drilldown_named",
      )!;
      const [p] = (await m.getAuditPatients(named.id)).pseudonyms;
      await m.listAudit({ q: p });
      await m.listAudit({ q: "req_nothing" });
      await m.reportUndisplayable([named.id], KEY());
      await m.startCheck(KEY());
      const out = await m.createExport(EXPORT, KEY());
      await m.createExport(
        {
          kind: "named_access",
          filters: { hospital: "h_northgate", clearance: "cl_northgate_2026" },
          reason: "internal_review",
          ...CODE,
        },
        KEY(),
      );
      await m.downloadExport(out.export_id);
      await failure(m.downloadExport(out.export_id));
      for (const r of (await m.listAudit({})).events.slice(0, 20)) {
        const d = readDetail(await m.getAuditEvent(r.id));
        expect(d.ok, r.kind).toBe(true);
      }
      expect(readDetail(await m.getAuditEvent(named.id)).ok).toBe(true);
      const na = readNamedAccess(
        await m.listNamedAccess({ hospital: "h_northgate" }),
      );
      expect(na.events).toHaveLength(3);
      expect(na.events.every((r) => r.ok)).toBe(true);
      const exp = readExportList(await m.listExports());
      expect(exp.exports.length).toBe(4);
      expect(exp.exports.every((r) => r.ok)).toBe(true);
      advance(2000);
      const s = readStatus(await m.getIntegrityStatus());
      expect(s.security_contact).not.toBeNull();
      expect(s.oldest_kept_at).not.toBeNull();
      const runs = readRunList(await m.listRuns());
      for (const r of runs.runs)
        expect(r.error_code === "unexpected_reply" && r.version === 0).toBe(
          false,
        );
      for (const e of (await everything(m)).filter((x) => x.type === "audit"))
        expect(readAuditEvent(e).ok).toBe(true);
      const hs = await m.listAuditHospitals();
      expect(hs.hospitals.length).toBeGreaterThanOrEqual(10);
      expect((await m.searchAuditPeople("ab")).people.length).toBeGreaterThan(
        0,
      );
    }
  });
});
