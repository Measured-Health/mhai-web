// The demo's clearance letters and named-access switch (Plan 11b), built on
// the mock core. Memory only, and separate from the clinical demo's store.
// It refuses what the backend refuses (spec §4 and §10), with the same codes.
import { ApiError } from "@mhai/api-client/errors";
import {
  ENDING_SOON_DAYS,
  NOTE_MAX,
  POSITION_LABEL,
  POSITION_ORDER,
  REJECT_LABEL,
  REVOKE_LABEL,
  dayLabel,
  daysBetween,
  type NamedPosition,
  type RejectReason,
  type RevokeReason,
} from "@mhai/ui/clearances";
import type { Person, TeamMember } from "./contract";
import {
  CLEARANCE_TABS,
  SIGNOFF_KINDS,
  SWITCH_LAPSE_DAYS,
  type Clearance,
  type ClearanceEvent,
  type ClearancesClient,
  type HospitalSwitch,
  type NamedAccessOut,
  type Signoffs,
  type SwitchRequest,
  type SwitchState,
} from "./clearances-contract";
import {
  LINKED,
  dayIn,
  emptySwitch,
  seedClearances,
  seedSwitch,
  type ClearanceRecord,
} from "./clearances-fixtures";
import type { MockCore } from "./mock";

const D = 86_400_000;
const PAGE = 50;
const REASON_MAX = 500;
const SIGNOFF_MAX = 200;
const DEMO_ZONE = "Africa/Lagos";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REJECT_REASONS = Object.keys(REJECT_LABEL) as RejectReason[];
const REVOKE_REASONS = Object.keys(REVOKE_LABEL) as RevokeReason[];

const iso = (ms: number) => new Date(ms).toISOString();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });
const rank = (p: NamedPosition) => POSITION_ORDER.indexOf(p);
const lower = (a: NamedPosition, b: NamedPosition) =>
  rank(a) <= rank(b) ? a : b;

/** Trimmed text of 1 to `max` characters, else 422. */
function text(v: unknown, max: number): string {
  if (typeof v !== "string") return invalid();
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : invalid();
}
/** An optional note: blank is none. */
function noteOf(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return invalid();
  return v.trim() === "" ? null : text(v, NOTE_MAX);
}
/** The version the person saw, which every change sends; else 422. */
function versionOf(body: unknown): number {
  const v = (body as { version?: unknown } | null)?.version;
  return typeof v === "number" ? v : invalid();
}
function positionOf(v: unknown): NamedPosition {
  return POSITION_ORDER.includes(v as NamedPosition)
    ? (v as NamedPosition)
    : invalid();
}
/** All three sign-offs, each with a name, a day and a reference; else 409. */
function signoffsOf(v: unknown): Signoffs {
  const o = (v ?? {}) as Record<string, unknown>;
  const out = {} as Signoffs;
  for (const k of SIGNOFF_KINDS) {
    const s = (o[k] ?? {}) as Record<string, unknown>;
    const filled = (x: unknown) => typeof x === "string" && x.trim() !== "";
    if (!filled(s.by) || !filled(s.at) || !filled(s.ref))
      fail(409, "signoff_missing");
    const at = (s.at as string).trim();
    if (!DAY.test(at)) invalid();
    out[k] = {
      by: text(s.by, SIGNOFF_MAX),
      at,
      ref: text(s.ref, SIGNOFF_MAX),
    };
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A sample page: invented text, the watermark baked in. An SVG, shown only in an <img>. */
function pageSvg(n: number, mark: string): Blob {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const w = 360 - ((i * 53) % 120);
    return `<rect x="60" y="${190 + i * 34}" width="${w}" height="9" rx="4" fill="#cfd4dc"/>`;
  }).join("");
  const marks = [140, 330, 520]
    .map(
      (y) =>
        `<text x="40" y="${y}" transform="rotate(-28 40 ${y})" font-size="22" fill="#1a2433" fill-opacity="0.16" font-family="sans-serif">${esc(mark)}</text>`,
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">` +
    `<rect width="480" height="640" fill="#ffffff"/>` +
    `<text x="60" y="80" font-size="20" font-family="sans-serif" fill="#1a2433">Sample clearance letter · page ${n}</text>` +
    `<text x="60" y="108" font-size="13" font-family="sans-serif" fill="#5b6472">Invented text for the demo. Not a real letter.</text>` +
    lines +
    marks +
    `</svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

/** "22 Oct 2026 10:30" in the hospital's time zone. */
function watermarkTime(ms: number, timeZone: string): string {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
  return `${dayLabel(dayIn(ms, timeZone))} ${t}`;
}

/** A letter's Activity target. */
const letterTarget = (c: ClearanceRecord) =>
  `the clearance letter signed by ${c.signed_by}`;
/** A switch change's Activity target. */
const switchTarget = (position: NamedPosition, hospital: Person | null) =>
  `${POSITION_LABEL[position]} for ${hospital ? hospital.name : "every hospital"}`;

export type ClearanceMockOptions = {
  /**
   * "unavailable": the letter list and the switch fail with 503. "off": the
   * global switch starts Off, with no history.
   */
  clearances?: "normal" | "unavailable" | "off";
};

export function createClearanceMock(
  core: MockCore,
  { clearances: mode = "normal" }: ClearanceMockOptions = {},
): ClearancesClient {
  const { now, log } = core;
  const zoneOf = (hospitalId: string) => {
    try {
      return core.findHospital(hospitalId).hospital.time_zone;
    } catch {
      return DEMO_ZONE;
    }
  };
  const todayAt = (hospitalId: string) => dayIn(now(), zoneOf(hospitalId));
  const letters = seedClearances(now(), dayIn(now(), DEMO_ZONE));
  const seed = seedSwitch(now(), mode !== "off");
  const global: SwitchState = seed.global;
  const scopes = new Map<string, SwitchState>(Object.entries(seed.hospitals));
  /** Requests that lapsed, so a late approval says `expired`, not 404. */
  const lapsed = new Set<string>();
  /** Requests approved, cancelled or superseded: a late act is a clash. */
  const decided = new Set<string>();

  const unavailable = () => {
    if (mode === "unavailable") fail(503, "unavailable");
  };

  // ---- Letters ----------------------------------------------------------

  /** Time passes: an active letter past its end date ends (once). */
  function settleLetters() {
    for (const c of letters)
      if (c.status === "active" && c.end_date < todayAt(c.hospital.id)) {
        c.status = "ended";
        c.history.push({
          at: iso(now()),
          kind: "ended",
          by: null,
          side: null,
          reason: null,
          note: null,
        });
        c.version++;
      }
  }
  const find = (id: string): ClearanceRecord => {
    settleLetters();
    return letters.find((c) => c.id === id) ?? fail(404, "not_found");
  };

  const coversYou = (c: ClearanceRecord, m: TeamMember) =>
    c.covered_platform.some((p) => p.id === m.id);
  /** Whether `m` may verify or reject a letter from this hospital at all. */
  function onTheirSide(c: ClearanceRecord, m: TeamMember): boolean {
    if (LINKED[m.id]?.includes(c.hospital.id)) return true;
    const domain = m.email.split("@")[1]?.toLowerCase() ?? "";
    try {
      return core
        .findHospital(c.hospital.id)
        .hospital.email_domains.includes(domain);
    } catch {
      return false;
    }
  }
  const view = (c: ClearanceRecord, m: TeamMember): Clearance => {
    const covers_you = coversYou(c, m);
    return {
      ...structuredClone(c),
      today: todayAt(c.hospital.id),
      covers_you,
      verifiable_by_you:
        m.role === "platform_admin" && !covers_you && !onTheirSide(c, m),
    };
  };

  /** Who can't verify or reject: same_person first, then same_side; both logged. */
  function refuseOwn(c: ClearanceRecord, m: TeamMember) {
    const code = coversYou(c, m)
      ? "same_person"
      : onTheirSide(c, m)
        ? "same_side"
        : null;
    if (!code) return;
    log(person(m), "clearance_verify_refused", {
      hospital: c.hospital,
      target: letterTarget(c),
      reason: code,
    });
    fail(409, code);
  }
  /** Only a waiting letter, as the person saw it. */
  function waitingAsSeen(c: ClearanceRecord, body: unknown) {
    const version = versionOf(body);
    if (c.status === "checking") fail(409, "not_ready");
    if (c.status !== "waiting") fail(409, "conflict");
    if (version !== c.version) fail(409, "conflict");
  }
  const push = (
    c: ClearanceRecord,
    kind: ClearanceEvent["kind"],
    m: TeamMember,
    reason: string | null = null,
    note: string | null = null,
  ) =>
    c.history.push({
      at: iso(now()),
      kind,
      by: person(m),
      side: "platform",
      reason,
      note,
    });

  const tabRows = (q: { status?: unknown }, rows: ClearanceRecord[]) => {
    const tab = q.status ?? "all";
    if (!CLEARANCE_TABS.includes(tab as never)) invalid();
    const since = (c: ClearanceRecord) =>
      Date.parse(c.ready_at ?? c.uploaded_at);
    switch (tab) {
      case "waiting":
        return rows
          .filter((c) => c.status === "waiting")
          .sort((a, b) => since(a) - since(b));
      case "active":
        return rows
          .filter((c) => c.status === "active")
          .sort((a, b) => (a.end_date < b.end_date ? -1 : 1));
      case "ending_soon":
        return rows
          .filter(
            (c) =>
              c.status === "active" &&
              daysBetween(todayAt(c.hospital.id), c.end_date) <=
                ENDING_SOON_DAYS,
          )
          .sort((a, b) => (a.end_date < b.end_date ? -1 : 1));
      default:
        return [...rows].sort(
          (a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at),
        );
    }
  };

  // ---- The switch -------------------------------------------------------

  const hospitalRefs = (): Person[] =>
    core
      .hospitals()
      .map((r) => r.hospital)
      .filter((h) => h.status !== "removed")
      .map((h) => ({ id: h.id, name: h.name }));
  const scopeOf = (hospital: string | null): SwitchState => {
    if (hospital === null) return global;
    const h = core.findHospital(hospital).hospital;
    if (h.status === "removed") fail(404, "not_found");
    let s = scopes.get(h.id);
    if (!s) {
      s = emptySwitch();
      scopes.set(h.id, s);
    }
    return s;
  };
  const allScopes = () => [global, ...scopes.values()];

  /** Time passes: requests lapse after 7 days. */
  function settleSwitch() {
    const t = now();
    for (const s of allScopes())
      if (s.request && t >= Date.parse(s.request.expires_at)) {
        lapsed.add(s.request.id);
        s.request = null;
        s.version++;
      }
  }
  function namedAccess(): NamedAccessOut {
    settleSwitch();
    const hospitals = hospitalRefs().map((hospital): HospitalSwitch => {
      const s = scopes.get(hospital.id) ?? emptySwitch();
      return {
        ...structuredClone(s),
        hospital,
        effective: lower(global.position, s.position),
      };
    });
    return {
      global: structuredClone(global),
      hospitals,
      today: dayIn(now(), DEMO_ZONE),
    };
  }
  const requestHospital = (hospital: unknown): string | null => {
    if (hospital === null) return null;
    if (typeof hospital !== "string") return invalid();
    return hospital;
  };
  const findRequest = (id: string) => {
    settleSwitch();
    const s = allScopes().find((x) => x.request?.id === id);
    if (!s) {
      if (lapsed.has(id)) return fail(409, "expired");
      return decided.has(id) ? fail(409, "conflict") : fail(404, "not_found");
    }
    return { scope: s, request: s.request! };
  };

  return {
    listClearances: (q) =>
      core.read((m) => {
        unavailable();
        settleLetters();
        let rows = letters;
        if (q.hospital) rows = rows.filter((c) => c.hospital.id === q.hospital);
        if (q.covers !== undefined) {
          if (q.covers !== "me") invalid();
          rows = rows.filter((c) => coversYou(c, m));
        }
        const all = tabRows(q, rows);
        const start = Math.max(0, Number(q.cursor) || 0);
        const end = start + PAGE;
        return {
          clearances: all.slice(start, end).map((c) => view(c, m)),
          next_cursor: end < all.length ? String(end) : null,
        };
      }),

    getClearance: (id) => core.read((m) => view(find(id), m)),

    async getClearancePage(id, n) {
      // A Blob can't be copied like a reply, so this read is done by hand.
      const m = core.you();
      await core.wait();
      const c = find(id);
      if (c.pages === 0) fail(409, "not_ready");
      if (!Number.isInteger(n) || n < 1 || n > c.pages) fail(404, "not_found");
      log(person(m), "clearance_viewed", {
        hospital: c.hospital,
        target: letterTarget(c),
      });
      return pageSvg(
        n,
        `${m.name} · ${watermarkTime(now(), zoneOf(c.hospital.id))}`,
      );
    },

    verifyClearance: (id, body, opts) =>
      core.write(opts, async (m) => {
        const c = find(id);
        refuseOwn(c, m);
        waitingAsSeen(c, body);
        await core.checkCode(m, body);
        c.status = "active";
        c.verified_by = person(m);
        c.verified_at = iso(now());
        push(c, "verified", m);
        c.version++;
        log(person(m), "clearance_verified", {
          hospital: c.hospital,
          target: letterTarget(c),
        });
        return view(c, m);
      }),

    rejectClearance: (id, body, opts) =>
      core.write(opts, async (m) => {
        const c = find(id);
        refuseOwn(c, m);
        waitingAsSeen(c, body);
        const b = (body ?? {}) as Record<string, unknown>;
        const reason = REJECT_REASONS.find((r) => r === b.reason) ?? invalid();
        const note = noteOf(b.note);
        if (reason === "other" && note === null) invalid();
        await core.checkCode(m, body);
        c.status = "rejected";
        c.rejection = { by: person(m), at: iso(now()), reason, note };
        push(c, "rejected", m, reason, note);
        c.version++;
        log(person(m), "clearance_rejected", {
          hospital: c.hospital,
          target: letterTarget(c),
          detail: REJECT_LABEL[reason],
        });
        return view(c, m);
      }),

    revokeClearance: (id, body, opts) =>
      core.write(opts, async (m) => {
        const c = find(id);
        const version = versionOf(body);
        if (c.status !== "waiting" && c.status !== "active")
          fail(409, "conflict");
        if (version !== c.version) fail(409, "conflict");
        const b = (body ?? {}) as Record<string, unknown>;
        const reason = REVOKE_REASONS.find((r) => r === b.reason) ?? invalid();
        const note = noteOf(b.note);
        if (reason === "other" && note === null) invalid();
        await core.checkCode(m, body);
        c.status = "revoked";
        c.revocation = {
          by: person(m),
          side: "platform",
          at: iso(now()),
          day: todayAt(c.hospital.id),
          reason,
          note,
        };
        push(c, "revoked", m, reason, note);
        c.version++;
        log(person(m), "clearance_revoked", {
          hospital: c.hospital,
          target: letterTarget(c),
          detail: REVOKE_LABEL[reason],
        });
        return view(c, m);
      }),

    getNamedAccess: () =>
      core.read(() => {
        unavailable();
        return namedAccess();
      }),

    requestNamedAccess: (body, opts) =>
      core.write(opts, async (m) => {
        settleSwitch();
        const b = (body ?? {}) as Record<string, unknown>;
        const hospital = requestHospital(b.hospital);
        const s = scopeOf(hospital);
        const position = positionOf(b.position);
        if (versionOf(b) !== s.version) fail(409, "conflict");
        // A request is always a raise; lowering is direct.
        if (rank(position) <= rank(s.position)) invalid();
        if (hospital !== null && rank(position) > rank(global.position))
          fail(409, "above_global");
        if (s.request) fail(409, "conflict");
        const signoffs = signoffsOf(b.signoffs);
        // No sign-off from the future, by Measured Health's day.
        const today = dayIn(now(), DEMO_ZONE);
        if (SIGNOFF_KINDS.some((k) => signoffs[k].at > today)) invalid();
        await core.checkCode(m, body);
        const ref =
          hospital === null
            ? null
            : (hospitalRefs().find((h) => h.id === hospital) ?? null);
        const req: SwitchRequest = {
          id: core.newId("req"),
          kind: "named_access",
          requested_by: person(m),
          requested_at: iso(now()),
          reason: `Turn named access to ${switchTarget(position, ref)}`,
          requested_by_you: true,
          expires_at: iso(now() + SWITCH_LAPSE_DAYS * D),
          hospital: ref,
          position,
          signoffs,
        };
        s.request = req;
        s.version++;
        log(person(m), "named_access_requested", {
          hospital: ref,
          target: switchTarget(position, ref),
        });
        return namedAccess();
      }),

    approveNamedAccess: (requestId, body, opts) =>
      core.write(opts, async (m) => {
        const { scope: s, request: r } = findRequest(requestId);
        if (versionOf(body) !== s.version) fail(409, "conflict");
        // Only the server's record of who asked decides, never a name.
        if (r.requested_by.id === m.id) fail(409, "same_person");
        // The global switch may have come down since it was asked for.
        if (r.hospital && rank(r.position) > rank(global.position))
          fail(409, "above_global");
        await core.checkCode(m, body);
        s.history.unshift({
          at: iso(now()),
          from: s.position,
          to: r.position,
          requested_by: r.requested_by,
          approved_by: person(m),
          lowered_by: null,
          reason: null,
          signoffs: r.signoffs,
        });
        s.position = r.position;
        s.since = iso(now());
        s.request = null;
        s.version++;
        decided.add(r.id);
        log(person(m), "named_access_approved", {
          hospital: r.hospital,
          target: switchTarget(r.position, r.hospital),
        });
        return namedAccess();
      }),

    cancelNamedAccess: (requestId, body, opts) =>
      core.write(opts, (m) => {
        const { scope: s, request: r } = findRequest(requestId);
        if (versionOf(body) !== s.version) fail(409, "conflict");
        s.request = null;
        s.version++;
        decided.add(r.id);
        log(person(m), "named_access_cancelled", {
          hospital: r.hospital,
          target: switchTarget(r.position, r.hospital),
        });
        return namedAccess();
      }),

    lowerNamedAccess: (body, opts) =>
      core.write(opts, async (m) => {
        settleSwitch();
        const b = (body ?? {}) as Record<string, unknown>;
        const hospital = requestHospital(b.hospital);
        const s = scopeOf(hospital);
        const position = positionOf(b.position);
        const reason = text(b.reason, REASON_MAX);
        if (versionOf(b) !== s.version) fail(409, "conflict");
        if (rank(position) >= rank(s.position)) invalid();
        await core.checkCode(m, body);
        const ref =
          hospital === null
            ? null
            : (hospitalRefs().find((h) => h.id === hospital) ?? null);
        // A raise waiting on this scope is superseded: it was asked for from
        // a position that no longer holds.
        if (s.request) {
          const old = s.request;
          decided.add(old.id);
          s.request = null;
          log(person(m), "named_access_cancelled", {
            hospital: ref,
            target: switchTarget(old.position, ref),
          });
        }
        s.history.unshift({
          at: iso(now()),
          from: s.position,
          to: position,
          requested_by: null,
          approved_by: null,
          lowered_by: person(m),
          reason,
          signoffs: null,
        });
        s.position = position;
        s.since = iso(now());
        s.version++;
        log(person(m), "named_access_lowered", {
          hospital: ref,
          target: switchTarget(position, ref),
          detail: reason,
        });
        return namedAccess();
      }),
  };
}
