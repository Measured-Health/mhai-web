import { describe, expect, it } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { auditEvent, checkpoint, intactRun } from "@/tests/audit-event";
import {
  integrityNotificationOk,
  readAuditEvent,
  readAuditList,
  readDetail,
  readExportRecord,
  readNamedAccess,
  readRun,
  readStatus,
} from "./read";

const bad = (raw: unknown) => readAuditEvent(raw).ok === false;
const list = (events: unknown[], over: object = {}) => ({
  events,
  next_cursor: null,
  total: events.length,
  total_capped: false,
  oldest_kept_at: "2020-10-22T00:00:00Z",
  last_checkpoint: checkpoint(),
  ...over,
});

describe("readAuditEvent", () => {
  it("a well-formed event reads", () => {
    const e = auditEvent();
    expect(readAuditEvent(e)).toEqual({ ok: true, event: e });
    // Other well-formed shapes.
    for (const ok of [
      auditEvent({ ip: "2001:db8::1", device: null, flag: "security" }),
      auditEvent({
        type: "named_access",
        kind: "drilldown_named",
        target: { kind: "patient", pseudonym: "p_ng_7f3a2c" },
        reason: "clinical_follow_up",
        facts: {
          view: "abnormal_results",
          location_type: "inpatient",
          patient_count: 12,
          purpose: "clinical_follow_up",
          from: "2026-10-01T00:00:00Z",
          to: "2026-10-22T00:00:00Z",
        },
        refs: {
          clearance_id: "cl_northgate_2026",
          export_id: null,
          request_id: null,
        },
      }),
      auditEvent({
        type: "audit",
        kind: "audit_viewed",
        target: null,
        reason: null,
        hospital: null,
        actor: { id: "system", name: "System", role: "system", kind: "system" },
        ip: null,
        facts: {
          filters: {
            hospital: "platform",
            type: ["sign_in", "security"],
            outcome: "refused",
            flagged: true,
            from: "2026-09-23T00:00:00Z",
            to: "2026-10-23T00:00:00Z",
          },
        },
      }),
      auditEvent({ note: "The contract ended in September." }),
      auditEvent({ after_break: true }),
    ])
      expect(readAuditEvent(ok).ok, JSON.stringify(ok)).toBe(true);
  });

  it("a patient target with a name is undisplayable", () => {
    expect(
      bad(
        auditEvent({
          type: "named_access",
          kind: "drilldown_named",
          reason: null,
          target: {
            kind: "patient",
            pseudonym: "p_ng_7f3a2c",
            name: "Jane Doe",
          } as never,
        }),
      ),
    ).toBe(true);
    // A pseudonym that isn't an opaque id.
    expect(
      bad(
        auditEvent({
          type: "named_access",
          kind: "drilldown_named",
          reason: null,
          target: { kind: "patient", pseudonym: "Jane Doe" },
        }),
      ),
    ).toBe(true);
    // A name on a target kind that never has one.
    expect(
      bad(
        auditEvent({
          target: { kind: "export", id: "exp_1", name: "x" } as never,
        }),
      ),
    ).toBe(true);
    // A name over 120 characters.
    expect(
      bad(
        auditEvent({
          target: { kind: "hospital", id: "h_1", name: "x".repeat(121) },
        }),
      ),
    ).toBe(true);
  });

  it("a note on signed_in is undisplayable", () => {
    const signedIn = auditEvent({
      type: "sign_in",
      kind: "signed_in",
      target: null,
      reason: null,
    });
    expect(bad(signedIn)).toBe(false);
    expect(bad({ ...signedIn, note: "Patient Jane Doe, MRN 1234" })).toBe(true);
    // A note too long where one is allowed, or empty.
    expect(bad(auditEvent({ note: "x".repeat(501) }))).toBe(true);
    expect(bad(auditEvent({ note: "" }))).toBe(true);
  });

  it("an unknown key in facts is undisplayable", () => {
    expect(
      bad(auditEvent({ facts: { question: "chest pain" } as never })),
    ).toBe(true);
    expect(bad({ ...auditEvent(), extra: 1 })).toBe(true);
    expect(
      bad({
        ...auditEvent(),
        actor: { ...auditEvent().actor, email: "a@b.c" },
      }),
    ).toBe(true);
    expect(
      bad({ ...auditEvent(), refs: { ...auditEvent().refs, mrn: "1" } }),
    ).toBe(true);
    expect(
      bad(
        auditEvent({
          facts: { filters: { q: "p_1", search: "Jane" } as never },
        }),
      ),
    ).toBe(true);
    // A code fact that isn't a code; a fact of the wrong type.
    expect(bad(auditEvent({ facts: { view: "Jane Doe's list" } }))).toBe(true);
    expect(bad(auditEvent({ facts: { patient_count: -1 } }))).toBe(true);
    expect(bad(auditEvent({ facts: { searched: "a b" } }))).toBe(true);
    // A missing key.
    const { device, ...noDevice } = auditEvent();
    void device;
    expect(bad(noDevice)).toBe(true);
  });

  it("a 7-character hash is undisplayable", () => {
    expect(bad(auditEvent({ hash: "abc1234" }))).toBe(true);
    expect(bad(auditEvent({ hash: "A".repeat(64) }))).toBe(true);
    expect(bad(auditEvent({ seq: 0 }))).toBe(true);
    expect(bad(auditEvent({ seq: 1.5 }))).toBe(true);
    expect(bad(auditEvent({ at: "yesterday" }))).toBe(true);
    expect(bad(auditEvent({ id: "ev.1" }))).toBe(true);
    expect(bad(auditEvent({ ip: "999.1.1.1" }))).toBe(true);
    expect(bad(auditEvent({ ip: "localhost" }))).toBe(true);
    expect(bad(auditEvent({ device: "<script>" }))).toBe(true);
    expect(bad(auditEvent({ device: "x".repeat(81) }))).toBe(true);
    expect(bad(auditEvent({ outcome: "maybe" as never }))).toBe(true);
    expect(bad(auditEvent({ flag: "red" as never }))).toBe(true);
    expect(bad(auditEvent({ after_break: "no" as never }))).toBe(true);
  });

  it("an unknown kind or reason is undisplayable", () => {
    expect(bad(auditEvent({ kind: "hospital_exploded" }))).toBe(true);
    expect(bad(auditEvent({ kind: "constructor" }))).toBe(true);
    expect(bad(auditEvent({ reason: "felt_like_it" }))).toBe(true);
    expect(bad(auditEvent({ type: "nonsense" as never }))).toBe(true);
    // A known kind under the wrong type.
    expect(bad(auditEvent({ type: "security" }))).toBe(true);
    expect(
      bad({ ...auditEvent(), actor: { ...auditEvent().actor, role: "owner" } }),
    ).toBe(true);
    expect(
      bad({ ...auditEvent(), actor: { ...auditEvent().actor, name: "" } }),
    ).toBe(true);
  });

  it("an undisplayable row keeps its id and seq, and never its text", () => {
    const raw = {
      ...auditEvent({ id: "ev_9", seq: 77 }),
      note: "Jane Doe",
      kind: "signed_in",
      type: "sign_in",
    };
    const r = readAuditEvent(raw);
    expect(r).toEqual({ ok: false, id: "ev_9", seq: 77 });
    expect(JSON.stringify(r)).not.toContain("Jane");
    expect(readAuditEvent({ id: "<b>", seq: -1 })).toEqual({
      ok: false,
      id: null,
      seq: null,
    });
    expect(readAuditEvent(null)).toEqual({ ok: false, id: null, seq: null });
  });
});

describe("readAuditList", () => {
  it("reads every row, keeping the bad ones as rows", () => {
    const good = auditEvent();
    const out = readAuditList(list([good, { id: "ev_2", seq: 2 }]));
    expect(out.events).toEqual([
      { ok: true, event: good },
      { ok: false, id: "ev_2", seq: 2 },
    ]);
    expect(out.total).toBe(2);
    expect(out.last_checkpoint).toEqual(checkpoint());
  });

  it("a bad envelope throws bad_reply", () => {
    for (const raw of [
      null,
      [],
      list([], { total: -1 }),
      list([], { total_capped: "no" }),
      list([], { oldest_kept_at: "soon" }),
      list([], { next_cursor: 5 }),
      list([], { last_checkpoint: { id: "cp" } }),
      { ...list([]), events: "none" },
    ]) {
      let err: unknown;
      try {
        readAuditList(raw);
      } catch (e) {
        err = e;
      }
      expect(err, JSON.stringify(raw)).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
      expect((err as ApiError).code).toBe("bad_reply");
    }
  });
});

describe("the other readers", () => {
  const letter = {
    id: "cl_northgate_2026",
    status: "active",
    valid_from: "2026-01-01",
    valid_to: "2026-12-31",
    verified_by: { id: "u_tunde", name: "Tunde Okafor" },
  };

  it("readDetail reads the patients count and the letter", () => {
    const d = { ...auditEvent(), patients: { count: 12 }, letter };
    expect(readDetail(d)).toEqual({ ok: true, event: d });
    expect(readDetail({ ...d, patients: { count: 12, ids: ["p_1"] } }).ok).toBe(
      false,
    );
    expect(readDetail({ ...d, letter: { ...letter, status: "lost" } }).ok).toBe(
      false,
    );
  });

  it("readNamedAccess keeps the letter on each row", () => {
    const e = { ...auditEvent(), letter };
    const out = readNamedAccess({
      events: [e, { id: "ev_2", seq: 3 }],
      next_cursor: "c2",
    });
    expect(out.events[0]).toEqual({ ok: true, event: e });
    expect(out.events[1]).toEqual({ ok: false, id: "ev_2", seq: 3 });
    expect(out.next_cursor).toBe("c2");
    expect(() => readNamedAccess({ events: [] })).toThrow(ApiError);
  });

  it("readExportRecord checks every field", () => {
    const rec = {
      id: "exp_1",
      kind: "events",
      by: { id: "u_ada", name: "Ada Bakare" },
      at: "2026-10-22T09:00:00Z",
      reason: "legal_request",
      note: null,
      reference: "CASE-12",
      filters: { hospital: "h_northgate", from: "2026-10-01T00:00:00Z" },
      filter_names: {
        hospital: "Northgate General Hospital",
        person: null,
        clearance: null,
      },
      rows: 120,
      capped: false,
      checksum: "b".repeat(64),
      expires_at: "2026-10-22T09:15:00Z",
      downloaded_at: null,
    };
    expect(readExportRecord(rec)).toEqual({ ok: true, record: rec });
    expect(readExportRecord({ ...rec, reason: "curiosity" })).toEqual({
      ok: false,
      id: "exp_1",
    });
    expect(readExportRecord({ ...rec, reference: "x".repeat(61) }).ok).toBe(
      false,
    );
    expect(readExportRecord({ ...rec, note: "x".repeat(201) }).ok).toBe(false);
    expect(readExportRecord({ ...rec, checksum: "abc" }).ok).toBe(false);
  });

  it("a run of the wrong shape reads as error with unexpected_reply", () => {
    expect(readRun(intactRun())).toEqual(intactRun());
    const odd = readRun({ ...intactRun(), entries_checked: "lots" });
    expect(odd).toMatchObject({
      id: "run_1",
      started_at: "2026-10-22T05:59:00Z",
      state: "error",
      error_code: "unexpected_reply",
      entries_checked: null,
      to_seq: null,
      finished_at: null,
    });
    expect(readRun("nonsense")).toMatchObject({
      id: null,
      started_at: null,
      state: "error",
      error_code: "unexpected_reply",
    });
    expect(readRun({ ...intactRun(), state: "fine" }).state).toBe("error");
    expect(readRun({ ...intactRun(), extra: true }).state).toBe("error");
  });

  it("readStatus keeps a broken run and throws on a bad envelope", () => {
    const status = {
      latest: intactRun(),
      running: null,
      open_failure: {
        ...intactRun({ state: "broken" }),
        id: "run_0",
        entries_checked: "?",
      },
      security_contact: { name: "Grace Ade", email: "security@example.org" },
      oldest_kept_at: "2020-10-22T00:00:00Z",
    };
    const s = readStatus(status);
    expect(s.latest).toEqual(intactRun());
    // A malformed failure is never dropped.
    expect(s.open_failure).toMatchObject({ id: "run_0", state: "error" });
    expect(() => readStatus({ ...status, security_contact: null })).toThrow(
      ApiError,
    );
    expect(() => readStatus({ ...status, oldest_kept_at: 3 })).toThrow(
      ApiError,
    );
  });

  it("integrityNotificationOk", () => {
    const n = {
      kind: "audit_integrity",
      id: "n_1",
      run_id: "run_0",
      first_broken_seq: 9_880_117,
      at: "2026-10-22T06:00:00Z",
      seen: false,
    };
    expect(integrityNotificationOk(n)).toBe(true);
    expect(integrityNotificationOk({ ...n, summary: "x" })).toBe(false);
    expect(integrityNotificationOk({ ...n, kind: "analytics_change" })).toBe(
      false,
    );
    expect(integrityNotificationOk({ ...n, first_broken_seq: 0 })).toBe(false);
    expect(integrityNotificationOk({ ...n, seen: undefined })).toBe(false);
  });
});
