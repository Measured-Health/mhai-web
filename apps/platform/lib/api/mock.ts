import { ApiError } from "@mhai/api-client/errors";
import {
  BlockedError,
  type ActivityAction,
  type ActivityEvent,
  type DeactivateReason,
  type Hospital,
  type HospitalIn,
  type HospitalSummary,
  type Person,
  type PlatformClient,
  type RemovalBlock,
  type RemovalRequest,
  type TeamMember,
  type TeamRole,
  type WriteOpts,
} from "./contract";
import {
  INVITE_MS,
  seedActivity,
  seedHospitals,
  seedTeam,
  type HospitalRecord,
} from "./fixtures";
import { getDemoStepUp, requireStepUp, type DemoStepUp } from "./step-up";
import {
  MEASURES,
  PERIODS,
  type Change,
  type FollowUp,
  type Period,
} from "./analytics-contract";
import {
  buildAnalytics,
  buildSeries,
  changeFlaggedAt,
  isAnalyticsHospital,
  seedChanges,
  type AnalyticsMode,
} from "./analytics-fixtures";
import { createMockOps } from "./mock-ops";
import type { HealthMode } from "./ops-fixtures";
import {
  EMAIL_MODES,
  NOTIFICATIONS_MAX,
  type EmailMode,
  type EmailPref,
  type Notification,
} from "./notifications-contract";

const PAGE = 50;
/** An approved removal becomes final this long after approval (demo time). */
const REMOVAL_DELAY_MS = 60_000;

const NAME_MAX = 120;
const REASON_MAX = 500;
const NOTE_MAX = 500;
const SHORT_CODE = /^[A-Z0-9]{2,8}$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REASONS: readonly DeactivateReason[] = [
  "contract_ended",
  "security_concern",
  "hospital_request",
  "other",
];
const ROLES: readonly TeamRole[] = ["platform_admin", "auditor"];
const REASON_WORDS: Record<DeactivateReason, string> = {
  contract_ended: "Contract ended",
  security_concern: "Security concern",
  hospital_request: "At the hospital's request",
  other: "Other",
};
const ROLE_WORDS: Record<TeamRole, string> = {
  platform_admin: "Platform admin",
  auditor: "Auditor",
};
const FIELD_WORDS = {
  name: "Name",
  short_code: "Short code",
  country: "Country",
  time_zone: "Time zone",
  email_domains: "Email domains",
} as const;

const iso = (ms: number) => new Date(ms).toISOString();
const copy = <T>(v: T): T => structuredClone(v);
const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");

/** Trimmed text of 1 to `max` characters, else 422. */
function text(v: unknown, max: number): string {
  if (typeof v !== "string") return invalid();
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : invalid();
}
function shortCode(v: unknown): string {
  if (typeof v !== "string") return invalid();
  const c = v.trim().toUpperCase();
  return SHORT_CODE.test(c) ? c : invalid();
}
/** Lower-cased, trimmed and de-duplicated; a comma-separated entry is split. */
export function normaliseDomains(v: unknown): string[] {
  if (!Array.isArray(v)) return invalid();
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== "string") return invalid();
    for (const part of entry.split(",")) {
      const d = part.trim().toLowerCase();
      if (!d) continue;
      if (!DOMAIN.test(d)) return invalid();
      if (!out.includes(d)) out.push(d);
    }
  }
  return out;
}
function email(v: unknown): string {
  const e = text(v, 254).toLowerCase();
  return EMAIL.test(e) ? e : invalid();
}
function httpsUrl(v: unknown): string {
  const t = text(v, 2000);
  try {
    if (new URL(t).protocol === "https:") return t;
  } catch {}
  return invalid();
}
/** "Lakeside Community Hospital" → "lakeside_community_hospital". */
const slug = (name: string) =>
  fold(name)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "hospital";

/** Who is signed in to the demo (set by the mock sign-in); null when nobody. */
let demoSignedIn: string | null = null;
export function setMockSignedIn(email: string | null) {
  demoSignedIn = email;
}

/**
 * What each area's mock (legal holds, operations, settings, the audit log)
 * is built on: the demo's clock, its people, its hospitals and its record
 * of activity, shared with the hospitals part. Built once per mock.
 */
export type MockCore = {
  now(): number;
  /** A fresh opaque id: `${prefix}_m{n}`. */
  newId(prefix: string): string;
  /** The demo's network delay. */
  wait(): Promise<void>;
  /** The signed-in team member: 401 when nobody, 403 when not on the team. */
  you(): TeamMember;
  /** A read: someone must be signed in. The reply is a per-caller copy. */
  read<T>(fn: (m: TeamMember) => T): Promise<T>;
  /**
   * A write: platform admins only (403 otherwise); the same Idempotency-Key
   * gets the same reply without doing it again.
   */
  write<T>(
    opts: WriteOpts | undefined,
    fn: (m: TeamMember) => T | Promise<T>,
  ): Promise<T>;
  /**
   * A write to the signed-in person's own state, which an auditor may make
   * too; the same key replays. Not logged.
   */
  own<T>(
    opts: WriteOpts | undefined,
    fn: (m: TeamMember) => T | Promise<T>,
  ): Promise<T>;
  /** Adds a line to Activity, newest first. */
  log(
    actor: Person,
    action: ActivityAction,
    extra?: {
      hospital?: Person | null;
      target?: string | null;
      detail?: string | null;
    },
  ): void;
  /** The person's own two-step or backup code in `body`, else refused. */
  checkCode(m: TeamMember, body: unknown): Promise<void>;
  /** The hospital's record, brought up to date; 404 when there is none. */
  findHospital(id: string): HospitalRecord;
  /** Every hospital's record, as stored (changes stick). */
  hospitals(): HospitalRecord[];
  /**
   * State one area keeps for another to read (e.g. whether the clean-up is
   * paused), by a key the areas agree on. Memory only.
   */
  shared: Record<string, unknown>;
};

/**
 * The demo's platform API: memory only (a reload resets it), never stored.
 * It refuses what the proxy and the backend refuse, with the same codes.
 */
export function createMockPlatform({
  now = () => Date.now(),
  me = () => demoSignedIn,
  delayMs = 150,
  stepUp,
  twoStep,
  analytics = "normal",
  notifications = "normal",
  health = "normal",
  onCore,
}: {
  now?: () => number;
  /** The signed-in email, or null. */
  me?: () => string | null;
  delayMs?: number;
  /** The two-step codes; by default the running demo's own. */
  stepUp?: DemoStepUp;
  /** Whether this account has two-step on; by default the team list says. */
  twoStep?: (email: string) => boolean;
  /** Which sample analytics to serve (see `AnalyticsMode`). */
  analytics?: AnalyticsMode;
  /** "unavailable": the notifications list and marking seen fail with 503. */
  notifications?: "normal" | "unavailable";
  /** Which sample health reading to serve (see `HealthMode`). */
  health?: HealthMode;
  /** For tests: the core the areas are built on, once it exists. */
  onCore?: (core: MockCore) => void;
} = {}): PlatformClient {
  const codes = stepUp ?? getDemoStepUp();
  let hospitals = seedHospitals(now());
  let team = seedTeam(now());
  let activity = seedActivity(now());
  /** What changed, with its follow-ups: kept for the life of the demo. */
  const changes = seedChanges(now(), analytics);
  /** Replies to writes already done, by Idempotency-Key. */
  const done = new Map<string, unknown>();
  /** Notification ids each person has seen, by team member id. */
  const seenBy = new Map<string, Set<string>>();
  /** Each platform admin's analytics email preference, by team member id. */
  const emailPrefs = new Map<string, EmailPref>();
  let nextId = 1;
  const newId = (prefix: string) => `${prefix}_m${nextId++}`;

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });
  const hospitalRef = (h: Hospital): Person => ({ id: h.id, name: h.name });

  /** The signed-in team member: 401 when nobody, 403 when not on the team. */
  function you(): TeamMember {
    const e = me()?.toLowerCase() ?? null;
    if (e === null) return fail(401, "session_expired");
    return (
      team.find((m) => m.status === "active" && m.email === e) ??
      fail(403, "forbidden")
    );
  }
  const hasTwoStep = (m: TeamMember) =>
    twoStep ? twoStep(m.email) : m.mfa_enabled;
  const checkCode = (m: TeamMember, body: unknown) =>
    requireStepUp(codes, { email: m.email, twoStep: hasTwoStep(m), body });

  function log(
    actor: Person,
    action: ActivityAction,
    {
      hospital = null,
      target = null,
      detail = null,
    }: {
      hospital?: Person | null;
      target?: string | null;
      detail?: string | null;
    } = {},
  ) {
    activity = [
      {
        id: newId("ev"),
        at: iso(now()),
        actor,
        action,
        hospital,
        target,
        detail,
      },
      ...activity,
    ];
  }

  /** A hospital lists its admins while it is active; nobody acts elsewhere. */
  function syncAdmins(h: Hospital) {
    const r = hospitals.find((x) => x.hospital === h);
    if (r) h.admins = h.status === "active" ? copy(r.admins) : [];
  }

  /** Time-driven changes: a removal a minute after approval; expired invites. */
  function settle(r: HospitalRecord) {
    const h = r.hospital;
    syncAdmins(h);
    if (
      h.status === "removal_scheduled" &&
      h.removal?.approved_at &&
      now() >= Date.parse(h.removal.approved_at) + REMOVAL_DELAY_MS
    ) {
      h.status = "removed";
      h.removal.status = "done";
      h.version++;
      log(h.removal.approved_by!, "hospital_removed", {
        hospital: hospitalRef(h),
      });
    }
    const inv = h.first_admin;
    if (inv?.status === "pending" && now() > Date.parse(inv.expires_at))
      inv.status = "expired";
  }
  function find(id: string): HospitalRecord {
    const r =
      hospitals.find((x) => x.hospital.id === id) ?? fail(404, "not_found");
    settle(r);
    return r;
  }
  /** Nothing changes a removed hospital. */
  const notRemoved = (h: Hospital) => {
    if (h.status === "removed") fail(409, "conflict");
  };
  const touch = (h: Hospital) => {
    h.version++;
    syncAdmins(h);
    return copy(h);
  };

  function blocksOf(r: HospitalRecord): RemovalBlock[] {
    const b: RemovalBlock[] = [];
    if (r.legal_holds > 0) b.push("legal_hold");
    if (r.retention_until && Date.parse(r.retention_until) > now())
      b.push("retention");
    if (r.export_required && !r.export_done) b.push("export_required");
    return b;
  }

  /**
   * A reply as the signed-in member sees it: every request in it (a
   * hospital's removal, a two-person request, wherever it sits) says whether
   * they asked for it, like TeamMember.is_you. `v` is a copy.
   */
  function forYou<T>(v: T, m: TeamMember): T {
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (x === null || typeof x !== "object") return;
      const o = x as Partial<Pick<RemovalRequest, "requested_by">> &
        Record<string, unknown>;
      if ("requested_by_you" in o && o.requested_by)
        o.requested_by_you = o.requested_by.id === m.id;
      Object.values(o).forEach(walk);
    };
    walk(v);
    // A change (a follow-up reply) or the analytics (its What changed list).
    const mine = (c: { follow_up?: FollowUp | null } | null | undefined) => {
      if (c?.follow_up) c.follow_up.by_you = c.follow_up.by.id === m.id;
    };
    mine(v as { follow_up?: FollowUp | null } | null);
    const ch = (v as { changes?: { items?: unknown } } | null)?.changes;
    if (Array.isArray(ch?.items)) ch.items.forEach(mine);
    return v;
  }

  /** A read: someone must be signed in. */
  async function read<T>(fn: (m: TeamMember) => T): Promise<T> {
    await wait();
    const m = you();
    return forYou(copy(fn(m)), m);
  }
  /**
   * A write: platform admins only; the same Idempotency-Key gets the same
   * reply without doing it again.
   */
  async function write<T>(
    opts: WriteOpts | undefined,
    fn: (m: TeamMember) => Promise<T> | T,
  ): Promise<T> {
    await wait();
    const m = you();
    if (m.role !== "platform_admin") fail(403, "forbidden");
    const key = opts?.idempotencyKey;
    if (key && done.has(key)) return forYou(copy(done.get(key) as T), m);
    const out = await fn(m);
    if (key) done.set(key, copy(out));
    return forYou(copy(out), m);
  }

  const summary = (h: Hospital): HospitalSummary => ({
    id: h.id,
    name: h.name,
    short_code: h.short_code,
    status: h.status,
    staff_count: h.staff_count,
    sso_enabled: h.sso_enabled,
    created_at: h.created_at,
    last_activity_at: h.last_activity_at,
  });
  const usedCode = (code: string, except?: string) =>
    hospitals.some(
      (r) => r.hospital.short_code === code && r.hospital.id !== except,
    );
  const newInvite = (name: string, mail: string) => ({
    invite_id: newId("inv"),
    name,
    email: mail,
    status: "pending" as const,
    sent_at: iso(now()),
    expires_at: iso(now() + INVITE_MS),
  });
  const page = <T>(rows: T[], cursor?: string) => {
    const start = Math.max(0, Number(cursor) || 0);
    const end = start + PAGE;
    return {
      rows: rows.slice(start, end),
      next_cursor: end < rows.length ? String(end) : null,
    };
  };
  const member = (id: string) =>
    team.find((t) => t.id === id) ?? fail(404, "not_found");
  const activeAdmins = () =>
    team.filter((t) => t.status === "active" && t.role === "platform_admin")
      .length;
  const isLastAdmin = (t: TeamMember) =>
    t.status === "active" && t.role === "platform_admin" && activeAdmins() <= 1;
  const mark = (t: TeamMember, m: TeamMember): TeamMember => ({
    ...t,
    is_you: t.id === m.id,
  });

  const period = (p: unknown): Period =>
    PERIODS.includes(p as Period) ? (p as Period) : invalid();
  const theChange = (id: string): Change =>
    changes.find((c) => c.id === id) ?? fail(404, "not_found");
  /** Every follow-up write sends the version it saw; else 409. */
  const sameVersion = (c: Change, body: unknown) => {
    const v = (body as { version?: unknown } | null)?.version;
    if (typeof v !== "number") invalid();
    if (v !== c.version) fail(409, "conflict");
  };
  const noSeries = () => {
    if (analytics === "unavailable") fail(503, "unavailable");
  };

  /** One per current change, newest first, as `m` has seen them. */
  function notificationsFor(m: TeamMember): Notification[] {
    if (notifications === "unavailable") fail(503, "unavailable");
    const seen = seenBy.get(m.id);
    return changes
      .map((c): Notification => ({
        id: `ntf_${c.id}`,
        change_id: c.id,
        hospital: c.hospital,
        summary: c.summary,
        serious: c.serious,
        direction: c.direction,
        measure: c.measure,
        previous: c.previous,
        current: c.current,
        at: changeFlaggedAt(c.id, now()),
        seen: seen?.has(`ntf_${c.id}`) ?? false,
      }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, NOTIFICATIONS_MAX);
  }
  const unseenOf = (items: Notification[]) =>
    items.filter((i) => !i.seen).length;
  /**
   * A write to the signed-in person's own state, which an auditor may make
   * too; the same Idempotency-Key gets the same reply. Not logged: it is no
   * admin action.
   */
  async function own<T>(
    opts: WriteOpts | undefined,
    fn: (m: TeamMember) => T | Promise<T>,
  ): Promise<T> {
    await wait();
    const m = you();
    const key = opts?.idempotencyKey;
    if (key && done.has(key)) return copy(done.get(key) as T);
    const out = await fn(m);
    if (key) done.set(key, copy(out));
    return copy(out);
  }
  /** The email preference is for platform admins only. */
  const prefOf = (m: TeamMember): EmailPref => {
    if (m.role !== "platform_admin") fail(403, "forbidden");
    return emailPrefs.get(m.id) ?? { mode: "off", version: 1 };
  };

  const core: MockCore = {
    now,
    newId,
    wait,
    you,
    read,
    write,
    own,
    log,
    checkCode,
    findHospital: find,
    hospitals: () => hospitals,
    shared: {},
  };
  onCore?.(core);

  const hospitalsPart = {
    listHospitals: (q) =>
      read(() => {
        hospitals.forEach(settle);
        const needle = q.q ? fold(q.q.trim()) : "";
        const rows = hospitals
          .map((r) => r.hospital)
          .filter((h) => !q.status || h.status === q.status)
          .filter(
            (h) =>
              !needle ||
              fold(h.name).includes(needle) ||
              fold(h.short_code).includes(needle),
          )
          .map(summary);
        const p = page(rows, q.cursor);
        return { hospitals: p.rows, next_cursor: p.next_cursor };
      }),

    addHospital: (body: HospitalIn, opts) =>
      write(opts, (m) => {
        const b = (body ?? {}) as Partial<HospitalIn>;
        const name = text(b.name, NAME_MAX);
        const code = shortCode(b.short_code);
        const country = text(b.country, 60);
        const time_zone = text(b.time_zone, 64);
        const email_domains = normaliseDomains(b.email_domains);
        const adminName = text(b.first_admin?.name, NAME_MAX);
        const adminEmail = email(b.first_admin?.email);
        if (usedCode(code)) fail(409, "duplicate");
        let id = `h_${slug(name)}`;
        for (let i = 2; hospitals.some((r) => r.hospital.id === id); i++)
          id = `h_${slug(name)}_${i}`;
        const h: Hospital = {
          id,
          name,
          short_code: code,
          status: "setup_incomplete",
          staff_count: 0,
          sso_enabled: false,
          created_at: iso(now()),
          last_activity_at: null,
          country,
          time_zone,
          email_domains,
          version: 1,
          deactivation: null,
          first_admin: newInvite(adminName, adminEmail),
          removal: null,
          admins: [],
        };
        hospitals = [
          ...hospitals,
          {
            hospital: h,
            admins: [],
            sso: {
              enabled: false,
              sign_in_url: null,
              client_id: null,
              issuer: null,
              allowed_domains: [],
              secret_saved: false,
              secret_ends: null,
              last_test: null,
              version: 1,
            },
            legal_holds: 0,
            retention_until: null,
            export_required: false,
            export_done: false,
          },
        ];
        log(person(m), "hospital_added", {
          hospital: hospitalRef(h),
          target: adminEmail,
        });
        return copy(h);
      }),

    getHospital: (id) => read(() => find(id).hospital),

    updateHospital: (id, body, opts) =>
      write(opts, (m) => {
        const h = find(id).hospital;
        notRemoved(h);
        if (body.version !== h.version) fail(409, "conflict");
        const next = {
          name: body.name === undefined ? h.name : text(body.name, NAME_MAX),
          short_code:
            body.short_code === undefined
              ? h.short_code
              : shortCode(body.short_code),
          country:
            body.country === undefined ? h.country : text(body.country, 60),
          time_zone:
            body.time_zone === undefined
              ? h.time_zone
              : text(body.time_zone, 64),
          email_domains:
            body.email_domains === undefined
              ? h.email_domains
              : normaliseDomains(body.email_domains),
        };
        if (usedCode(next.short_code, h.id)) fail(409, "duplicate");
        const changed = (Object.keys(FIELD_WORDS) as (keyof typeof next)[])
          .filter((k) => JSON.stringify(next[k]) !== JSON.stringify(h[k]))
          .map((k) => FIELD_WORDS[k]);
        Object.assign(h, next);
        log(person(m), "hospital_updated", {
          hospital: hospitalRef(h),
          detail: changed.join(", ") || null,
        });
        return touch(h);
      }),

    deactivate: (id, body, opts) =>
      write(opts, async (m) => {
        const h = find(id).hospital;
        if (h.status !== "active" && h.status !== "setup_incomplete")
          fail(409, "conflict");
        const reason = body?.reason;
        if (!REASONS.includes(reason)) invalid();
        const note =
          body.note === undefined || body.note.trim() === ""
            ? null
            : text(body.note, REASON_MAX);
        if (reason === "other" && note === null) invalid();
        await checkCode(m, body);
        h.status = "deactivated";
        h.deactivation = { by: person(m), at: iso(now()), reason, note };
        log(person(m), "hospital_deactivated", {
          hospital: hospitalRef(h),
          detail: REASON_WORDS[reason],
        });
        return touch(h);
      }),

    reactivate: (id, body, opts) =>
      write(opts, async (m) => {
        const h = find(id).hospital;
        if (h.status !== "deactivated") fail(409, "conflict");
        const reason = text(body?.reason, REASON_MAX);
        await checkCode(m, body);
        const setUp = !h.first_admin || h.first_admin.status === "accepted";
        h.status = setUp ? "active" : "setup_incomplete";
        h.deactivation = null;
        log(person(m), "hospital_reactivated", {
          hospital: hospitalRef(h),
          detail: reason,
        });
        return touch(h);
      }),

    requestRemoval: (id, body, opts) =>
      write(opts, async (m) => {
        const r = find(id);
        const h = r.hospital;
        if (h.status !== "deactivated") fail(409, "conflict");
        const reason = text(body?.reason, REASON_MAX);
        await checkCode(m, body);
        h.status = "removal_pending";
        h.removal = {
          status: "requested",
          requested_by: person(m),
          requested_by_you: true,
          requested_at: iso(now()),
          reason,
          approved_by: null,
          approved_at: null,
          checks: {
            legal_holds: r.legal_holds,
            retention_until: r.retention_until,
            export_required: r.export_required,
            export_done: r.export_done,
          },
          blocking: blocksOf(r),
        };
        log(person(m), "removal_requested", {
          hospital: hospitalRef(h),
          detail: reason,
        });
        return touch(h);
      }),

    approveRemoval: (id, body, opts) =>
      write(opts, async (m) => {
        const r = find(id);
        const h = r.hospital;
        if (h.status !== "removal_pending" || !h.removal)
          fail(404, "not_found");
        const removal = h.removal!;
        if (removal.requested_by.id === m.id) fail(409, "same_person");
        const blocking = blocksOf(r);
        removal.blocking = blocking;
        if (blocking.length > 0) {
          // A refused approval is still worth a line in the record.
          log(person(m), "removal_blocked", {
            hospital: hospitalRef(h),
            detail: blocking.join(", "),
          });
          throw new BlockedError(blocking);
        }
        await checkCode(m, body);
        h.status = "removal_scheduled";
        removal.status = "scheduled";
        removal.approved_by = person(m);
        removal.approved_at = iso(now());
        log(person(m), "removal_approved", { hospital: hospitalRef(h) });
        return touch(h);
      }),

    cancelRemoval: (id, opts) =>
      write(opts, (m) => {
        const h = find(id).hospital;
        notRemoved(h);
        if (
          (h.status !== "removal_pending" &&
            h.status !== "removal_scheduled") ||
          !h.removal
        )
          fail(404, "not_found");
        h.status = "deactivated";
        h.removal = null;
        log(person(m), "removal_cancelled", { hospital: hospitalRef(h) });
        return touch(h);
      }),

    getSso: (id) => read(() => find(id).sso),

    saveSso: (id, body, opts) =>
      write(opts, (m) => {
        const r = find(id);
        notRemoved(r.hospital);
        const s = r.sso;
        if (body.version !== s.version) fail(409, "conflict");
        const enabled = body.enabled === true;
        /** Blank is fine while sign-in is off; required once it is on. */
        const opt = (v: unknown, check: (v: unknown) => string) =>
          v === undefined ||
          v === null ||
          (typeof v === "string" && v.trim() === "")
            ? enabled
              ? invalid()
              : null
            : check(v);
        const sign_in_url = opt(body.sign_in_url, httpsUrl);
        const issuer = opt(body.issuer, httpsUrl);
        const client_id = opt(body.client_id, (v) => text(v, 200));
        const allowed_domains = normaliseDomains(body.allowed_domains ?? []);
        const secret =
          body.client_secret === undefined || body.client_secret === ""
            ? null
            : text(body.client_secret, 500);
        if (secret !== null && secret.length < 8) invalid();
        if (enabled && !s.secret_saved && secret === null) invalid();
        /** Any change to how sign-in works voids the last test. */
        const changed =
          sign_in_url !== s.sign_in_url ||
          issuer !== s.issuer ||
          client_id !== s.client_id ||
          allowed_domains.join(",") !== s.allowed_domains.join(",") ||
          secret !== null;
        r.sso = {
          ...s,
          last_test: changed ? null : s.last_test,
          enabled,
          sign_in_url,
          issuer,
          client_id,
          allowed_domains,
          secret_saved: s.secret_saved || secret !== null,
          secret_ends: secret !== null ? secret.slice(-4) : s.secret_ends,
          version: s.version + 1,
        };
        r.hospital.sso_enabled = enabled;
        log(person(m), "sso_updated", {
          hospital: hospitalRef(r.hospital),
          detail: enabled ? "On" : "Off",
        });
        return r.sso;
      }),

    testSso: (id, opts) =>
      write(opts, (m) => {
        const r = find(id);
        notRemoved(r.hospital);
        if (!r.sso.sign_in_url || !r.sso.secret_saved) fail(409, "conflict");
        const message = "Sign-in works.";
        r.sso = {
          ...r.sso,
          last_test: { at: iso(now()), ok: true, message },
        };
        log(person(m), "sso_tested", {
          hospital: hospitalRef(r.hospital),
          detail: message,
        });
        return r.sso;
      }),

    inviteAdmin: (id, body, opts) =>
      write(opts, (m) => {
        const h = find(id).hospital;
        if (h.status !== "active" && h.status !== "setup_incomplete")
          fail(409, "conflict");
        const name = text(body?.name, NAME_MAX);
        const mail = email(body?.email);
        h.first_admin = newInvite(name, mail);
        log(person(m), "admin_invited", {
          hospital: hospitalRef(h),
          target: mail,
        });
        return touch(h);
      }),

    resendInvite: (id, inviteId, opts) =>
      write(opts, (m) => {
        const h = find(id).hospital;
        notRemoved(h);
        const inv = h.first_admin;
        if (!inv || inv.invite_id !== inviteId) return fail(404, "not_found");
        if (inv.status === "accepted") fail(409, "conflict");
        inv.status = "pending";
        inv.sent_at = iso(now());
        inv.expires_at = iso(now() + INVITE_MS);
        log(person(m), "admin_invite_resent", {
          hospital: hospitalRef(h),
          target: inv.email,
        });
        return touch(h);
      }),

    listTeam: () => read((m) => ({ members: team.map((t) => mark(t, m)) })),

    inviteTeam: (body, opts) =>
      write(opts, (m) => {
        const name = text(body?.name, NAME_MAX);
        const mail = email(body?.email);
        const role = body?.role;
        if (!ROLES.includes(role)) invalid();
        if (team.some((t) => t.email === mail)) fail(409, "duplicate");
        const t: TeamMember = {
          id: newId("tm"),
          name,
          email: mail,
          role,
          status: "invite_pending",
          mfa_enabled: false,
          last_sign_in_at: null,
          is_you: false,
          version: 1,
        };
        team = [...team, t];
        log(person(m), "team_invited", {
          target: mail,
          detail: ROLE_WORDS[role],
        });
        return t;
      }),

    changeRole: (id, body, opts) =>
      write(opts, (m) => {
        const t = member(id);
        if (body?.version !== t.version) fail(409, "conflict");
        const role = body.role;
        if (!ROLES.includes(role)) invalid();
        if (role === t.role) return mark(t, m);
        if (isLastAdmin(t)) fail(409, "last_admin");
        if (t.id === m.id) fail(409, "own_role");
        const next = { ...t, role, version: t.version + 1 };
        team = team.map((x) => (x.id === t.id ? next : x));
        log(person(m), "team_role_changed", {
          target: t.name,
          detail: ROLE_WORDS[role],
        });
        return mark(next, m);
      }),

    removeMember: (id, body, opts) =>
      write(opts, async (m) => {
        const t = member(id);
        if (isLastAdmin(t)) fail(409, "last_admin");
        await checkCode(m, body);
        team = team.filter((x) => x.id !== t.id);
        log(person(m), "team_removed", { target: t.name });
      }),

    listActivity: (q) =>
      read(() => {
        hospitals.forEach(settle);
        const rows = activity.filter(
          (e) => !q.hospital || e.hospital?.id === q.hospital,
        );
        const p = page<ActivityEvent>(rows, q.cursor);
        return { events: p.rows, next_cursor: p.next_cursor };
      }),

    getAnalytics: (p) =>
      read(() => buildAnalytics(period(p), now(), analytics, changes)),

    getChangeSeries: (id, p) =>
      read(() => {
        const per = period(p);
        noSeries();
        const c = theChange(id);
        return buildSeries(c.hospital?.id ?? null, c.measure, per, now());
      }),

    getHospitalSeries: (id, measure, p) =>
      read(() => {
        const per = period(p);
        if (!MEASURES.includes(measure)) invalid();
        noSeries();
        if (!isAnalyticsHospital(id)) fail(404, "not_found");
        return buildSeries(id, measure, per, now());
      }),

    followUp: (id, body, opts) =>
      write(opts, (m) => {
        const c = theChange(id);
        const raw = (body as { note?: unknown } | null)?.note;
        const note =
          raw === undefined || raw === null
            ? undefined
            : typeof raw !== "string"
              ? invalid()
              : raw.trim() === ""
                ? null
                : text(raw, NOTE_MAX);
        sameVersion(c, body);
        const f = c.follow_up;
        const target = { hospital: c.hospital, target: c.summary };
        if (f) {
          // Only its author edits a follow-up.
          if (f.by.id !== m.id) fail(403, "forbidden");
          f.note = note === undefined ? f.note : note;
          f.version++;
          log(person(m), "change_note_edited", { ...target, detail: f.note });
        } else {
          c.follow_up = {
            by: person(m),
            // Set per caller on the way out (see forYou).
            by_you: false,
            at: iso(now()),
            note: note ?? null,
            version: 1,
          };
          log(person(m), "change_followed_up", {
            ...target,
            detail: note ?? null,
          });
        }
        c.version++;
        return copy(c);
      }),

    undoFollowUp: (id, body, opts) =>
      write(opts, (m) => {
        const c = theChange(id);
        sameVersion(c, body);
        if (!c.follow_up) fail(409, "conflict");
        c.follow_up = null;
        c.version++;
        log(person(m), "change_follow_up_undone", {
          hospital: c.hospital,
          target: c.summary,
        });
        return copy(c);
      }),

    listNotifications: () =>
      read((m) => {
        const items = notificationsFor(m);
        return { items, unseen: unseenOf(items) };
      }),

    markSeen: (body, opts) =>
      own(opts, (m) => {
        const raw = (body as { ids?: unknown } | null)?.ids;
        if (
          raw !== undefined &&
          (!Array.isArray(raw) || raw.some((x) => typeof x !== "string"))
        )
          invalid();
        const ids = raw as string[] | undefined;
        const items = notificationsFor(m);
        const seen = seenBy.get(m.id) ?? new Set<string>();
        // No ids: all of them. Ids that aren't in the list are ignored.
        for (const i of items) if (!ids || ids.includes(i.id)) seen.add(i.id);
        seenBy.set(m.id, seen);
        return { unseen: unseenOf(notificationsFor(m)) };
      }),

    getEmailPref: () => read((m) => prefOf(m)),

    setEmailPref: (body, opts) =>
      write(opts, (m) => {
        const b = (body ?? {}) as { mode?: unknown; version?: unknown };
        if (!EMAIL_MODES.includes(b.mode as EmailMode)) invalid();
        if (typeof b.version !== "number") invalid();
        const cur = prefOf(m);
        if (b.version !== cur.version) fail(409, "conflict");
        const next: EmailPref = {
          mode: b.mode as EmailMode,
          version: cur.version + 1,
        };
        emailPrefs.set(m.id, next);
        return next;
      }),
  } satisfies Partial<PlatformClient>;

  // Each area adds one spread, built on the same core, e.g.
  // `...createMockHolds(core, holds)`.
  return {
    ...hospitalsPart,
    ...createMockOps(core, { health }),
  };
}
