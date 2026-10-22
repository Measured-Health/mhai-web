// The demo's audit log (spec §13): a seeded sample plus the reads, exports
// and checks made in the session. Memory only. It sends codes, never words,
// and every reply passes the strict reader in lib/audit/read.ts.
import { ApiError } from "@mhai/api-client/errors";
import { auditFile } from "@/lib/audit/file";
import { KINDS } from "@/lib/audit/kinds";
import { filtersInWords } from "@/lib/audit/words";
import {
  AUDIT_TYPES,
  EXPORT_MAX_ROWS,
  EXPORT_NOTE_MAX,
  EXPORT_REFERENCE_MAX,
  OUTCOME_NOTE_MAX,
  TooManyRowsError,
  type AuditActor,
  type AuditClient,
  type AuditDetail,
  type AuditEvent,
  type AuditFacts,
  type AuditFilters,
  type AuditTarget,
  type ExportKind,
  type ExportReason,
  type ExportRecord,
  type IntegrityStatus,
  type NamedAccessFilters,
  type SearchedKind,
  type VerifyRun,
} from "./audit-contract";
import {
  CHECKED_FROM_SEQ,
  CHECK_MS,
  SECURITY_CONTACT,
  auditHospitals,
  auditPeople,
  fingerprint as fingerprintOf,
  seedAudit,
  type SeedMode,
} from "./audit-fixtures";
import type { Person, TeamMember, WriteOpts } from "./contract";
import { storedZip } from "./demo-zip";
import type { MockCore } from "./mock";
import type { IntegrityNotification } from "./notifications-contract";

export type AuditMockOptions = {
  integrity?: SeedMode;
  /** Two malformed sample events. */
  bad?: boolean;
  /** Overrides total, total_capped and the export row count. */
  matchCount?: number;
  /** The server caps an export's file at this many rows (marked capped). */
  exportCap?: number;
  /** Every audit read is 503. */
  unavailable?: boolean;
};

const PAGE = 50;
const CAP = 10_000;
const EXPORT_MS = 15 * 60_000;
const ID = /^[A-Za-z0-9_-]+$/;
const REASONS: readonly ExportReason[] = [
  "legal_request",
  "hospital_request",
  "regulator_request",
  "internal_review",
  "security_investigation",
  "other",
];
const OUTCOMES = ["succeeded", "refused", "failed"];

const iso = (ms: number) => new Date(ms).toISOString();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const isInstant = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });

type Filters = AuditFilters & { clearance?: string };

/** Only known keys, each of its shape; anything else is 422 `invalid`. */
function cleanFilters(raw: unknown, keys: readonly string[]): Filters {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) return invalid();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (!keys.includes(k)) invalid();
    const ok =
      k === "type"
        ? Array.isArray(v) && v.every((t) => AUDIT_TYPES.includes(t))
        : k === "outcome"
          ? OUTCOMES.includes(v as string)
          : k === "flagged"
            ? typeof v === "boolean"
            : k === "from" || k === "to"
              ? isInstant(v)
              : isId(v);
    if (!ok) invalid();
    out[k] = v;
  }
  return out as Filters;
}
const EVENT_KEYS = [
  "hospital",
  "person",
  "type",
  "outcome",
  "flagged",
  "from",
  "to",
  "q",
];
const NAMED_KEYS = ["hospital", "person", "clearance", "from", "to"];

const idCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(data: Uint8Array): Promise<string> {
  return hex(
    await globalThis.crypto.subtle.digest("SHA-256", data as BufferSource),
  );
}

export function createMockAudit(
  core: MockCore,
  opts: AuditMockOptions = {},
): AuditClient & { notifications(): IntegrityNotification[] } {
  const mode = opts.integrity ?? "intact";
  const seed = seedAudit(core.now(), mode, opts.bad === true);
  /** Newest first. */
  let log: AuditEvent[] = seed.events;
  const pseudonyms = seed.pseudonyms;
  const letters = seed.letters;
  const cp = seed.checkpoint;
  const people = auditPeople();
  const hospitals = auditHospitals();
  let exportsList: ExportRecord[] = seed.exports;
  const files = new Map<string, Blob>();
  /** Finished checks, newest first. */
  let runs: VerifyRun[] = seed.runs;
  type Pending = {
    id: string;
    startedAt: number;
    by: TeamMember;
    toSeq: number;
  };
  let pending: Pending | null = null;
  /** Each person's last filter set, as a string. */
  const lastView = new Map<string, string>();

  const up = () => {
    if (opts.unavailable) throw new ApiError(503, "unavailable");
  };
  const actorOf = (m: TeamMember): AuditActor => ({
    id: m.id,
    name: m.name,
    role: m.role,
    kind: "platform",
  });

  /** Adds an entry, newest. */
  function record(
    actor: AuditActor,
    kind: string,
    x: {
      at?: number;
      target?: AuditTarget | null;
      outcome?: AuditEvent["outcome"];
      reason?: string | null;
      note?: string | null;
      refs?: Partial<AuditEvent["refs"]>;
      facts?: AuditFacts;
    } = {},
  ) {
    const seq = log[0].seq + 1;
    const id = `ev_${seq}`;
    const newest = Date.parse(log[0].at);
    const e: AuditEvent = {
      id,
      seq,
      hash: fingerprintOf(seq, id),
      at: iso(Math.max(x.at ?? core.now(), newest)),
      actor,
      hospital: null,
      type: KINDS[kind].type,
      kind,
      target: x.target ?? null,
      outcome: x.outcome ?? "succeeded",
      ip: actor.kind === "system" ? null : "198.51.100.7",
      device: actor.kind === "system" ? null : "Firefox 140 on Linux",
      flag: null,
      reason: x.reason ?? null,
      note: x.note ?? null,
      refs: {
        clearance_id: null,
        export_id: null,
        request_id: core.newId("req"),
        ...x.refs,
      },
      facts: x.facts ?? {},
      after_break: false,
    };
    log = [e, ...log];
  }

  const brokenAt = seed.firstBrokenSeq;
  const shown = (e: AuditEvent): AuditEvent =>
    brokenAt !== null && e.seq >= brokenAt && !e.after_break
      ? { ...e, after_break: true }
      : e;

  function matches(e: AuditEvent, f: Filters): boolean {
    if (f.hospital !== undefined) {
      if (
        f.hospital === "platform"
          ? e.hospital !== null
          : e.hospital?.id !== f.hospital
      )
        return false;
    }
    if (f.person && e.actor.id !== f.person) return false;
    if (f.clearance && e.refs.clearance_id !== f.clearance) return false;
    if (f.type?.length && !f.type.includes(e.type)) return false;
    if (f.outcome && e.outcome !== f.outcome) return false;
    if (f.flagged && e.flag === null) return false;
    const t = Date.parse(e.at);
    if (f.from && t < Date.parse(f.from)) return false;
    if (f.to && t >= Date.parse(f.to)) return false;
    if (f.q) {
      const q = f.q;
      const hit =
        e.id === q ||
        e.refs.request_id === q ||
        e.refs.export_id === q ||
        e.refs.clearance_id === q ||
        (pseudonyms[e.id]?.includes(q) ?? false) ||
        (e.target?.kind === "patient" && e.target.pseudonym === q);
      if (!hit) return false;
    }
    return true;
  }

  /** What a search was for, by what it matched (else by its prefix). */
  function searchedKind(q: string): SearchedKind {
    if (log.some((e) => e.id === q)) return "event";
    if (log.some((e) => e.refs.request_id === q)) return "request";
    if (log.some((e) => e.refs.export_id === q)) return "export";
    if (log.some((e) => e.refs.clearance_id === q)) return "clearance";
    if (Object.values(pseudonyms).some((p) => p.includes(q)))
      return "pseudonym";
    if (q.startsWith("p_")) return "pseudonym";
    if (q.startsWith("req_")) return "request";
    if (q.startsWith("exp_")) return "export";
    if (q.startsWith("cl_")) return "clearance";
    return "event";
  }

  /** A read of the log is itself recorded, when the filter set is new. */
  function noteView(m: TeamMember, f: Filters) {
    const key = JSON.stringify(
      Object.entries(f).sort(([a], [b]) => idCompare(a, b)),
    );
    if (lastView.get(m.id) === key) return;
    lastView.set(m.id, key);
    const { q, ...rest } = f;
    const filters = Object.keys(rest).length ? { filters: rest } : {};
    if (q)
      record(actorOf(m), "audit_searched", {
        facts: { searched: q, searched_kind: searchedKind(q), ...filters },
      });
    else record(actorOf(m), "audit_viewed", { facts: { filters: rest } });
  }

  function pageOf<T extends { seq: number }>(
    rows: T[],
    cursor: string | undefined,
  ): { page: T[]; next: string | null } {
    let start = rows;
    if (cursor !== undefined) {
      const m = /^s(\d{1,15})$/.exec(cursor);
      if (!m) return invalid();
      start = rows.filter((e) => e.seq < Number(m[1]));
    }
    const page = start.slice(0, PAGE);
    return {
      page,
      next: start.length > PAGE ? `s${page[page.length - 1].seq}` : null,
    };
  }

  // ---- Integrity ----
  function finish(p: Pending): VerifyRun {
    const by = person(p.by);
    const common = {
      id: p.id,
      started_at: iso(p.startedAt),
      finished_at: iso(p.startedAt + CHECK_MS),
      by,
      from_checkpoint: cp,
      from_first: false,
      outcome: null,
      version: 1,
    };
    const none = {
      to_seq: null,
      to_at: null,
      first_broken_seq: null,
      first_broken_at: null,
      error_code: null,
    };
    if (mode === "error")
      return {
        ...common,
        ...none,
        state: "error",
        entries_checked: null,
        error_code: "timed_out",
      };
    if (mode === "broken" && brokenAt !== null)
      return {
        ...common,
        ...none,
        state: "broken",
        entries_checked: brokenAt - CHECKED_FROM_SEQ,
        first_broken_seq: brokenAt,
        first_broken_at: log.find((e) => e.seq === brokenAt)!.at,
      };
    return {
      ...common,
      ...none,
      state: "intact",
      entries_checked: mode === "unproven" ? 0 : p.toSeq - CHECKED_FROM_SEQ,
      to_seq: p.toSeq,
      to_at: iso(p.startedAt),
    };
  }

  /** A running check finishes once 1.5 s of the clock have passed. */
  function settle() {
    if (!pending || core.now() < pending.startedAt + CHECK_MS) return;
    const p = pending;
    pending = null;
    const run = finish(p);
    runs = [run, ...runs];
    record(actorOf(p.by), "audit_check_run", {
      at: p.startedAt + CHECK_MS,
      target: { kind: "run", id: run.id },
      facts:
        run.state === "broken"
          ? { state: "broken", first_broken_seq: run.first_broken_seq! }
          : { state: run.state },
    });
  }

  function runningRun(p: Pending): VerifyRun {
    const total = p.toSeq - CHECKED_FROM_SEQ;
    const part = Math.min(1, (core.now() - p.startedAt) / CHECK_MS);
    return {
      id: p.id,
      started_at: iso(p.startedAt),
      finished_at: null,
      by: person(p.by),
      state: "running",
      entries_checked: Math.min(total - 1, Math.floor(total * part)),
      from_checkpoint: cp,
      from_first: false,
      to_seq: null,
      to_at: null,
      first_broken_seq: null,
      first_broken_at: null,
      error_code: null,
      outcome: null,
      version: 1,
    };
  }

  const status = (): IntegrityStatus => {
    settle();
    const latest = runs[0] ?? null;
    return {
      latest,
      running: pending ? runningRun(pending) : null,
      open_failure: latest?.state === "broken" ? latest : null,
      security_contact: SECURITY_CONTACT,
      oldest_kept_at: cp.before,
    };
  };

  // ---- Exports ----
  function parseExport(body: unknown) {
    if (!isObj(body)) return invalid();
    const kind = body.kind;
    if (kind !== "events" && kind !== "named_access") return invalid();
    const reason = body.reason as ExportReason;
    if (!REASONS.includes(reason)) invalid();
    const note = body.note;
    if (note !== undefined && note !== null) {
      if (typeof note !== "string" || note.length > EXPORT_NOTE_MAX) invalid();
    }
    const n = typeof note === "string" && note.trim() ? note.trim() : null;
    if (reason === "other" && n === null) invalid();
    const ref = body.reference;
    if (ref !== undefined && ref !== null) {
      if (typeof ref !== "string" || ref.length > EXPORT_REFERENCE_MAX)
        invalid();
    }
    const reference = typeof ref === "string" && ref.trim() ? ref.trim() : null;
    const filters = cleanFilters(
      body.filters,
      kind === "events" ? EVENT_KEYS : NAMED_KEYS,
    );
    if (kind === "named_access") {
      if (
        !filters.hospital ||
        !hospitals.some((h) => h.id === filters.hospital)
      )
        invalid();
      if (!filters.clearance && !(filters.from && filters.to)) invalid();
    }
    return { kind: kind as ExportKind, reason, note: n, reference, filters };
  }

  const stamp = (ms: number) =>
    iso(ms).slice(0, 16).replace(/[-:]/g, "").replace("T", "-");

  async function createExport(m: TeamMember, body: unknown) {
    await core.checkCode(m, body);
    const x = parseExport(body);
    const named = x.kind === "named_access";
    const matching = log
      .filter((e) => (named ? e.kind === "drilldown_named" : true))
      .filter((e) => matches(e, x.filters))
      .map(shown);
    const matched = opts.matchCount ?? matching.length;
    if (matched > EXPORT_MAX_ROWS) throw new TooManyRowsError(matched);
    const cap = opts.exportCap;
    const capped = cap !== undefined && matched > cap;
    const rows = capped ? cap : matched;
    const snapshot = capped ? matching.slice(0, cap) : matching;

    const now = core.now();
    const exportId = core.newId("exp");
    const { q, ...factFilters } = x.filters;
    void q;
    // The entry first, then the file.
    record(actorOf(m), named ? "named_access_exported" : "audit_exported", {
      target: { kind: "export", id: exportId },
      reason: x.reason,
      note: x.note,
      refs: { export_id: exportId },
      facts: { rows, capped, filters: factFilters },
    });

    const names = {
      hospital:
        x.filters.hospital && x.filters.hospital !== "platform"
          ? (hospitals.find((h) => h.id === x.filters.hospital)?.name ?? null)
          : null,
      person: x.filters.person
        ? (people.find((p) => p.id === x.filters.person)?.name ?? null)
        : null,
      clearance: x.filters.clearance ?? null,
    };
    const csv = auditFile({
      kind: x.kind,
      exportId,
      by: person(m),
      at: iso(now),
      reason: x.reason,
      note: x.note,
      reference: x.reference,
      filtersWords: filtersInWords(x.filters as NamedAccessFilters, names),
      rows: named
        ? snapshot.map((e) => ({ ...e, pseudonyms: pseudonyms[e.id] ?? [] }))
        : snapshot,
      demo: true,
      capped,
    });
    const enc = new TextEncoder();
    const base = `audit-${named ? "named-access" : "events"}-${exportId}-${stamp(now)}Z`;
    let bytes: Uint8Array;
    let fileName: string;
    let type: string;
    if (named) {
      const ids = [
        ...new Set(snapshot.map((e) => e.refs.clearance_id).filter(isId)),
      ];
      bytes = storedZip([
        { name: `${base}.csv`, data: enc.encode(csv) },
        ...ids.map((id) => ({
          name: `letter-${id}.txt`,
          data: enc.encode(
            `Demo placeholder for clearance letter ${id}. A real package holds the signed letter.\r\n`,
          ),
        })),
      ]);
      fileName = `${base}.zip`;
      type = "application/zip";
    } else {
      bytes = enc.encode(csv);
      fileName = `${base}.csv`;
      type = "text/csv;charset=utf-8";
    }
    const checksum = await sha256(bytes);
    const expires = iso(now + EXPORT_MS);
    files.set(exportId, new Blob([bytes as BlobPart], { type }));
    exportsList = [
      {
        id: exportId,
        kind: x.kind,
        by: person(m),
        at: iso(now),
        reason: x.reason,
        note: x.note,
        reference: x.reference,
        filters: x.filters,
        filter_names: names,
        rows,
        capped,
        checksum,
        expires_at: expires,
        downloaded_at: null,
      },
      ...exportsList,
    ];
    return {
      export_id: exportId,
      rows,
      capped,
      checksum,
      expires_at: expires,
      file_name: fileName,
    };
  }

  const after = <T extends { id: string }>(
    rows: T[],
    cursor: string | undefined,
  ) => {
    let start = rows;
    if (cursor !== undefined) {
      const i = rows.findIndex((r) => `x${r.id}` === cursor);
      if (i < 0) return invalid();
      start = rows.slice(i + 1);
    }
    const page = start.slice(0, PAGE);
    return {
      page,
      next: start.length > PAGE ? `x${page[page.length - 1].id}` : null,
    };
  };

  return {
    listAudit: (f, cursor) =>
      core.read((m) => {
        up();
        settle();
        const flt = cleanFilters(f, EVENT_KEYS);
        const matched = log.filter((e) => matches(e, flt));
        const { page, next } = pageOf(matched, cursor);
        const total = opts.matchCount ?? matched.length;
        const reply = {
          events: page.map(shown),
          next_cursor: next,
          total,
          total_capped: total > CAP,
          oldest_kept_at: cp.before,
          last_checkpoint: cp,
        };
        if (cursor === undefined) noteView(m, flt);
        return reply;
      }),

    getAuditEvent: (id) =>
      core.read((m): AuditDetail => {
        up();
        const e = log.find((x) => x.id === id) ?? fail(404, "not_found");
        const cid = e.refs.clearance_id;
        const reply: AuditDetail = {
          ...shown(e),
          patients: pseudonyms[id] ? { count: pseudonyms[id].length } : null,
          letter: (cid && letters[cid]) || null,
        };
        record(actorOf(m), "audit_event_opened", {
          target: { kind: "event", id },
        });
        return reply;
      }),

    getAuditPatients: (id) =>
      core.read((m) => {
        up();
        const list = pseudonyms[id];
        if (!list || !log.some((e) => e.id === id)) fail(404, "not_found");
        record(actorOf(m), "audit_patients_viewed", {
          target: { kind: "event", id },
        });
        return { pseudonyms: [...list] };
      }),

    searchAuditPeople: (q) =>
      core.read(() => {
        up();
        const needle = fold(q.trim());
        if (needle.length < 2) invalid();
        return {
          people: people
            .filter(
              (p) =>
                fold(p.name).includes(needle) || fold(p.email).includes(needle),
            )
            .slice(0, 20),
        };
      }),

    listAuditHospitals: () =>
      core.read(() => {
        up();
        return {
          hospitals: [...hospitals].sort((a, b) => idCompare(a.name, b.name)),
        };
      }),

    reportUndisplayable: (ids, opts2: WriteOpts) =>
      core.own(opts2, (m) => {
        if (
          !Array.isArray(ids) ||
          ids.length < 1 ||
          ids.length > 50 ||
          !ids.every(isId)
        )
          invalid();
        for (const id of new Set(ids))
          record(actorOf(m), "audit_undisplayable_reported", {
            target: { kind: "event", id },
          });
      }),

    listNamedAccess: (f, cursor) =>
      core.read(() => {
        up();
        const flt = cleanFilters(f, NAMED_KEYS);
        const rows = log
          .filter((e) => e.kind === "drilldown_named" && matches(e, flt))
          .flatMap((e) => {
            const cid = e.refs.clearance_id;
            const letter = cid ? letters[cid] : undefined;
            return letter ? [{ ...shown(e), letter }] : [];
          });
        const { page, next } = pageOf(rows, cursor);
        return { events: page, next_cursor: next };
      }),

    createExport: (body, opts2) =>
      core.own(opts2, (m) => createExport(m, body)),

    async downloadExport(id) {
      await core.wait();
      up();
      const m = core.you();
      const rec =
        exportsList.find((r) => r.id === id) ?? fail(404, "not_found");
      // Only its maker may download it; anyone else is refused (and the
      // refusal says nothing of whether the file is still there).
      if (rec.by.id !== m.id) {
        record(actorOf(m), "export_download_refused", {
          target: { kind: "export", id },
          outcome: "refused",
          reason: "not_owner",
          refs: { export_id: id },
        });
        return fail(403, "forbidden");
      }
      const blob = files.get(id);
      const at = core.now();
      if (rec.downloaded_at || !blob || at >= Date.parse(rec.expires_at)) {
        record(actorOf(m), "export_download_refused", {
          target: { kind: "export", id },
          outcome: "refused",
          reason: "gone",
          refs: { export_id: id },
        });
        return fail(410, "gone");
      }
      rec.downloaded_at = iso(at);
      files.delete(id);
      record(actorOf(m), "export_downloaded", {
        target: { kind: "export", id },
        refs: { export_id: id },
      });
      return blob;
    },

    listExports: (cursor) =>
      core.read(() => {
        up();
        const { page, next } = after(exportsList, cursor);
        return { exports: page, next_cursor: next };
      }),

    startCheck: (opts2) =>
      core.own(opts2, (m) => {
        settle();
        if (pending) return { run_id: pending.id };
        pending = {
          id: core.newId("run"),
          startedAt: core.now(),
          by: m,
          toSeq: log[0].seq,
        };
        return { run_id: pending.id };
      }),

    getIntegrityStatus: () =>
      core.read(() => {
        up();
        return status();
      }),

    listRuns: (cursor) =>
      core.read(() => {
        up();
        settle();
        const all = [...(pending ? [runningRun(pending)] : []), ...runs];
        const { page, next } = after(all, cursor);
        return { runs: page, next_cursor: next };
      }),

    getRun: (id) =>
      core.read(() => {
        up();
        settle();
        if (pending?.id === id) return runningRun(pending);
        return runs.find((r) => r.id === id) ?? fail(404, "not_found");
      }),

    addOutcome: (runId, body, opts2) =>
      core.own(opts2, (m) => {
        if (m.role !== "auditor") fail(403, "forbidden");
        settle();
        const run = runs.find((r) => r.id === runId) ?? fail(404, "not_found");
        const note = (body as { note?: unknown } | null)?.note;
        const version = (body as { version?: unknown } | null)?.version;
        if (
          typeof note !== "string" ||
          note.trim().length < 1 ||
          note.length > OUTCOME_NOTE_MAX ||
          typeof version !== "number"
        )
          invalid();
        if (run.state !== "broken") fail(409, "conflict");
        if (version !== run.version) fail(409, "conflict");
        run.outcome = {
          note: (note as string).trim(),
          by: person(m),
          at: iso(core.now()),
        };
        run.version++;
        record(actorOf(m), "audit_check_outcome", {
          target: { kind: "run", id: run.id },
        });
        return run;
      }),

    notifications() {
      settle();
      const run = runs[0];
      if (!run || run.state !== "broken" || run.first_broken_seq === null)
        return [];
      return [
        {
          kind: "audit_integrity",
          id: `ntf_audit_${run.id}`,
          run_id: run.id,
          first_broken_seq: run.first_broken_seq,
          at: run.finished_at ?? run.started_at,
          seen: false,
        },
      ];
    },
  };
}
