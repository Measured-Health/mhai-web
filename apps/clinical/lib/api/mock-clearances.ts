import {
  COVER_MAX,
  LETTER_MAX_BYTES,
  dayLabel,
  type NamedPosition,
} from "@mhai/ui/clearances";
import { getAuthClient } from "../auth/client";
import {
  createStepUp,
  getDemoStepUp,
  type StepUp as CodeStore,
} from "../auth/mock";
import { getAdminClient } from "./admin";
import type {
  ActivityEventOut,
  ActivityType,
  StaffOut,
} from "./admin-contract";
import type { ClearanceClient } from "./clearances";
import type {
  ClearanceEventOut,
  ClearanceOut,
  CoveredOut,
  StepUp,
} from "./clearances-contract";
import {
  PLATFORM_ADMINS,
  sampleClearances,
  shiftDay,
} from "./clearances-fixtures";
import { ApiError, NotEligibleError } from "@mhai/api-client/errors";
import type { WriteOpts } from "./contract";
import { recordAudit } from "./mock-audit";

/** How long a new upload stays "Checking the file" in the demo. */
export const CHECK_MS = 3000;
/** Pages a sample upload comes back with. */
const SAMPLE_PAGES = 3;
const HOSPITAL_ZONE = "Africa/Lagos";
const DAY = 86_400_000;

const iso = (ms: number) => new Date(ms).toISOString();
const copy = <T>(v: T): T => structuredClone(v);

const zoned = (ms: number) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOSPITAL_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
};

/** The hospital's day (the mock is the only place that does this sum). */
const hospitalDay = (ms: number) => zoned(ms).day;

/** The latest end date a letter may have: a year on, never past a real day. */
function maxEndDate(today: string): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y + 1, m - 1, d));
  // 29 Feb on a non-leap year rolls into March: step back to the last day.
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string) => YMD.test(s) && shiftDay(s, 0) === s;

// The store: memory only and module-level, so the Analysis mock can ask who
// is covered. A reload resets it.
type Store = {
  letters: ClearanceOut[];
  /** When each letter started "checking". */
  checking: Map<string, number>;
  /** Replies to writes, by Idempotency-Key. */
  done: Map<string, ClearanceOut>;
  next: number;
};
let store: Store | null = null;

function seeded(now: number): Store {
  return (store ??= {
    letters: sampleClearances(now, hospitalDay(now)),
    checking: new Map([["cl_check", now]]),
    done: new Map(),
    next: 1,
  });
}

/** Clears the sample letters, so the next call re-seeds them (tests). */
export function resetClearances(): void {
  store = null;
}

const COVERING = (c: ClearanceOut) => c.covered;

/**
 * The letter that lets this person see names right now, if any: active, and
 * its end date (the hospital's day) not yet passed. For the Analysis mock.
 */
export function coverFor(
  staffId: string,
  now: number,
): { clearance_id: string; until: string; version: number } | null {
  const today = hospitalDay(now);
  const best = seeded(now)
    .letters.filter(
      (c) =>
        c.status === "active" &&
        c.end_date >= today &&
        COVERING(c).some((p) => p.id === staffId),
    )
    .sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
  return best
    ? { clearance_id: best.id, until: best.end_date, version: best.version }
    : null;
}

type FileKind = "pdf" | "png" | "jpeg";
/** The type a file really is, from its first bytes; its name and claimed type don't count. */
async function fileKind(file: Blob): Promise<FileKind | null> {
  const head = new Uint8Array(await readBytes(file.slice(0, 8)));
  const is = (...b: number[]) => b.every((v, i) => head[i] === v);
  if (is(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (is(0xff, 0xd8, 0xff)) return "jpeg";
  return null;
}

function readBytes(b: Blob): Promise<ArrayBuffer> {
  if (typeof b.arrayBuffer === "function") return b.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
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

const watermarkTime = (ms: number) => {
  const { day, time } = zoned(ms);
  return `${dayLabel(day)} ${time}`;
};

export function createMockClearances({
  now = () => Date.now(),
  me: meOpt,
  delayMs = 150,
  stepUp,
  namedAccess = "on",
  staff: staffOpt,
}: {
  now?: () => number;
  me?: () => Promise<string | null>;
  delayMs?: number;
  /** The two-step codes; by default the running demo's own. */
  stepUp?: CodeStore;
  namedAccess?: NamedPosition;
  /** The hospital's staff, as the admin client lists them. */
  staff?: () => Promise<StaffOut[]>;
} = {}): ClearanceClient {
  const me =
    meOpt ??
    (async () => (await getAuthClient().getSession())?.user.email ?? null);
  const staff = staffOpt ?? (() => getAdminClient().listStaff());
  const codes = (): CodeStore =>
    (stepUp ??= meOpt === undefined ? getDemoStepUp() : createStepUp(now));

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };

  const myEmail = async () => (await me())?.toLowerCase() ?? null;
  const myName = async () => {
    const email = await myEmail();
    return (
      (await staff().catch(() => [])).find(
        (s) => s.email.toLowerCase() === email,
      )?.display_name ?? "Hospital admin"
    );
  };

  const log = (
    type: ActivityType,
    kind: ActivityEventOut["kind"],
    actor: string | null,
    extra: Partial<ActivityEventOut> = {},
  ) =>
    recordAudit({
      at: iso(now()),
      type,
      kind,
      actor: actor === null ? null : { display_name: actor },
      target: null,
      specialty: null,
      confidence: null,
      device: null,
      count: null,
      flag: null,
      ...extra,
    });

  /** Every hospital call: refused while the switch is Off. */
  const gate = () => {
    if (namedAccess === "off") fail(403, "named_access_off");
  };

  const checkCode = async (auth: StepUp) => {
    const r = await codes().check(await myEmail(), auth);
    if (r === "locked") fail(429, "mfa_locked");
    if (r === "invalid") fail(403, "mfa_invalid");
  };

  const event = (
    kind: ClearanceEventOut["kind"],
    by: string | null,
    over: Partial<ClearanceEventOut> = {},
  ): ClearanceEventOut => ({
    at: iso(now()),
    kind,
    by: by === null ? null : { display_name: by },
    side: by === null ? null : "hospital",
    reason: null,
    note: null,
    ...over,
  });

  /** Time passes: checks finish, and letters past their end date end (once). */
  function catchUp(): Store {
    const s = seeded(now());
    const t = now();
    const today = hospitalDay(t);
    for (const c of s.letters) {
      const since = s.checking.get(c.id);
      if (
        c.status === "checking" &&
        since !== undefined &&
        t - since >= CHECK_MS
      ) {
        s.checking.delete(c.id);
        c.status = "waiting";
        c.pages = SAMPLE_PAGES;
        c.history.push({ ...event("ready", null), at: iso(since + CHECK_MS) });
        c.version += 1;
      }
      if (c.status === "active" && c.end_date < today) {
        c.status = "ended";
        c.history.push(event("ended", null));
        c.version += 1;
        log("admin", "clearance_ended", null);
      }
    }
    return s;
  }

  const find = (s: Store, id: string) =>
    s.letters.find((c) => c.id === id) ?? fail(404, "not_found");

  /** Runs a write once per Idempotency-Key. */
  async function once(
    opts: WriteOpts | undefined,
    run: (s: Store) => Promise<ClearanceOut>,
  ): Promise<ClearanceOut> {
    await wait();
    gate();
    const s = catchUp();
    const key = opts?.idempotencyKey;
    const before = key ? s.done.get(key) : undefined;
    if (before) return copy(before);
    const out = await run(s);
    if (key) s.done.set(key, copy(out));
    return copy(out);
  }

  return {
    async getNamedAccess() {
      await wait();
      return namedAccess === "off"
        ? { position: "off", since: null }
        : { position: namedAccess, since: iso(now() - 30 * DAY) };
    },

    async listClearances() {
      await wait();
      gate();
      const s = catchUp();
      const today = hospitalDay(now());
      return {
        clearances: copy(s.letters).sort((a, b) =>
          a.uploaded_at < b.uploaded_at ? 1 : -1,
        ),
        today,
        max_end_date: maxEndDate(today),
      };
    },

    async getClearance(id) {
      await wait();
      gate();
      return copy(find(catchUp(), id));
    },

    uploadClearance(u, opts) {
      return once(opts, async (s) => {
        await checkCode(u);
        if (u.file.size > LETTER_MAX_BYTES) fail(413, "file_too_large");
        const kind = await fileKind(u.file);
        if (kind === null) fail(415, "file_type");
        const today = hospitalDay(now());
        if (!isDay(u.end_date) || u.end_date <= today) fail(422, "invalid");
        if (u.end_date > maxEndDate(today)) fail(422, "end_date_too_late");
        if (
          !isDay(u.letter_date) ||
          u.letter_date > today ||
          u.letter_date > u.end_date
        )
          fail(422, "invalid");
        if (!u.signed_by.trim() || !u.signer_title.trim()) fail(422, "invalid");

        const ids = [...new Set(u.covered)];
        const emails = [
          ...new Set(
            (u.covered_platform ?? []).map((e) => e.trim().toLowerCase()),
          ),
        ];
        if (
          ids.length + emails.length < 1 ||
          ids.length + emails.length > COVER_MAX
        )
          fail(422, "invalid");

        const rows = await staff();
        const people: CoveredOut[] = [];
        const bad: string[] = [];
        for (const id of ids) {
          const p = rows.find((r) => r.id === id);
          const ok =
            p &&
            p.status === "active" &&
            (p.roles.includes("hospital_admin") ||
              p.roles.includes("analyst")) &&
            !p.issues.includes("mfa_not_set_up");
          if (p && ok) people.push({ id: p.id, display_name: p.display_name });
          else bad.push(id);
        }
        if (bad.length)
          throw new NotEligibleError("not_eligible", { ids: bad });
        const platform: CoveredOut[] = [];
        const badEmails: string[] = [];
        for (const e of emails) {
          const p = PLATFORM_ADMINS[e];
          if (p) platform.push({ ...p });
          else badEmails.push(e);
        }
        if (badEmails.length)
          throw new NotEligibleError("not_eligible_platform", {
            emails: badEmails,
          });

        const by = await myName();
        const c: ClearanceOut = {
          id: `cl_up${s.next++}`,
          status: "checking",
          refused_reason: null,
          signed_by: u.signed_by.trim(),
          signer_title: u.signer_title.trim(),
          letter_date: u.letter_date,
          covered: people,
          covered_platform: platform,
          end_date: u.end_date,
          uploaded_by: { display_name: by },
          uploaded_at: iso(now()),
          verified_by: null,
          verified_at: null,
          rejection: null,
          revocation: null,
          renews: u.renews ?? null,
          pages: 0,
          history: [event("uploaded", by)],
          version: 1,
        };
        s.letters.unshift(c);
        s.checking.set(c.id, now());
        log("admin", "clearance_uploaded", by);
        return c;
      });
    },

    revokeClearance(id, body, opts) {
      return once(opts, async (s) => {
        await checkCode(body);
        const c = find(s, id);
        if (c.status !== "waiting" && c.status !== "active")
          fail(409, "conflict");
        const by = await myName();
        const note = body.note?.trim() || null;
        c.status = "revoked";
        c.revocation = {
          by: { display_name: by },
          side: "hospital",
          at: iso(now()),
          reason: body.reason,
          note,
        };
        c.history.push(event("revoked", by, { reason: body.reason, note }));
        c.version += 1;
        log("admin", "clearance_revoked", by);
        return c;
      });
    },

    narrowClearance(id, body, opts) {
      return once(opts, async (s) => {
        await checkCode(body);
        const c = find(s, id);
        if (c.status !== "waiting" && c.status !== "active")
          fail(409, "conflict");
        if (typeof body.version !== "number" || body.version !== c.version)
          fail(409, "conflict");
        const all = [...c.covered, ...c.covered_platform];
        const remove = [...new Set(body.remove)];
        if (!remove.length || remove.some((r) => !all.some((p) => p.id === r)))
          fail(422, "invalid");
        if (remove.length >= all.length) fail(422, "would_empty");
        const gone = all.filter((p) => remove.includes(p.id));
        const by = await myName();
        const note = body.note?.trim() || null;
        c.covered = c.covered.filter((p) => !remove.includes(p.id));
        c.covered_platform = c.covered_platform.filter(
          (p) => !remove.includes(p.id),
        );
        c.history.push(
          event("narrowed", by, {
            reason: body.reason,
            note,
            removed: copy(gone),
          }),
        );
        c.version += 1;
        for (const p of gone)
          log("admin", "clearance_narrowed", by, {
            target: { display_name: p.display_name },
          });
        return c;
      });
    },

    async getClearancePage(id, n) {
      await wait();
      gate();
      const c = find(catchUp(), id);
      if (c.pages === 0) fail(409, "not_ready");
      if (!Number.isInteger(n) || n < 1 || n > c.pages) fail(404, "not_found");
      const viewer = await myName();
      log("admin", "clearance_viewed", viewer);
      return pageSvg(n, `${viewer} · ${watermarkTime(now())}`);
    },
  };
}
