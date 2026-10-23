import { getAuthClient } from "../auth/client";
import { getAdminClient } from "./admin";
import type { ActivityEventOut, StaffOut } from "./admin-contract";
import type { WriteOpts } from "./contract";
import {
  FLAG_LEVELS,
  type AlertSettingsOut,
  type AlertSettingsPatchIn,
  type EmrClient,
  type FlagLevel,
  type RecordsStatus,
} from "./emr-contract";
import { sampleAlertSettings } from "./emr-fixtures";
import { ApiError } from "./errors";
import { recordAudit } from "./mock-audit";

const iso = (ms: number) => new Date(ms).toISOString();
const copy = <T>(v: T): T => structuredClone(v);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isIds = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const SECTIONS = ["units", "rules", "recipients"] as const;
const EVENT = {
  units: "alert_units_changed",
  rules: "alert_rules_changed",
  recipients: "alert_recipients_changed",
} as const;

/**
 * The demo's alert settings for one hospital: memory only, one object per
 * mock (a reload or sign-out resets it), never stored. It enforces what the
 * backend must: one section per save, the version, known ids and levels,
 * at least one recipient, and only active clinicians named. Each save logs
 * one Activity event as the signed-in admin.
 */
export function createMockEmr({
  now = () => Date.now(),
  me: meOpt,
  delayMs = 150,
  connection = "connected",
  staff: staffOpt,
}: {
  now?: () => number;
  /** The signed-in admin's email; by default the session's. */
  me?: () => Promise<string | null>;
  delayMs?: number;
  /** The records connection's state (tests and the e2e); connected by default. */
  connection?: RecordsStatus;
  /** The hospital's staff, as the admin client lists them. */
  staff?: () => Promise<StaffOut[]>;
} = {}): EmrClient {
  let settings = sampleAlertSettings(now(), connection);
  const done = new Map<string, AlertSettingsOut>();
  const me =
    meOpt ??
    (async () => (await getAuthClient().getSession())?.user.email ?? null);
  const staff = staffOpt ?? (() => getAdminClient().listStaff());

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };

  const myName = async (people: StaffOut[]) => {
    const email = (await me())?.toLowerCase() ?? null;
    return (
      people.find((s) => s.email.toLowerCase() === email)?.display_name ??
      "Hospital admin"
    );
  };

  const log = (kind: ActivityEventOut["kind"], actor: string) =>
    recordAudit({
      at: iso(now()),
      type: "admin",
      kind,
      actor: { display_name: actor },
      target: null,
      specialty: null,
      confidence: null,
      device: null,
      count: null,
      flag: null,
    });

  /** The next settings for one section, or a refusal. Changes nothing. */
  function apply(
    p: Record<string, unknown>,
    section: (typeof SECTIONS)[number],
    people: StaffOut[],
  ): AlertSettingsOut {
    const next = copy(settings);
    const body = p[section];
    if (!isObj(body)) return fail(422, "invalid");
    if (section === "units") {
      const covered = body.covered;
      if (!isIds(covered)) return fail(422, "invalid");
      const known = new Set(next.units.map((u) => u.id));
      if (!covered.every((id) => known.has(id))) fail(422, "invalid");
      const on = new Set(covered);
      for (const u of next.units) u.covered = on.has(u.id);
    } else if (section === "rules") {
      const levels = body.levels;
      if (!isObj(levels)) return fail(422, "invalid");
      for (const [id, level] of Object.entries(levels)) {
        const c = next.categories.find((x) => x.id === id);
        if (!c || !(FLAG_LEVELS as readonly unknown[]).includes(level))
          fail(422, "invalid");
        c!.level = level as FlagLevel;
      }
    } else {
      const { queue, clinician_ids: ids } = body;
      if (typeof queue !== "boolean" || !isIds(ids))
        return fail(422, "invalid");
      if (!queue && ids.length === 0) fail(422, "no_recipients");
      const named = [...new Set(ids)].map((id) => {
        const s = people.find(
          (x) =>
            x.id === id &&
            x.status === "active" &&
            x.roles.includes("clinician"),
        );
        return s
          ? { id: s.id, display_name: s.display_name, specialty: s.specialty }
          : fail(422, "invalid");
      });
      next.recipients = { queue, clinicians: named };
    }
    return next;
  }

  return {
    async getAlertSettings() {
      await wait();
      return copy(settings);
    },
    async updateAlertSettings(p: AlertSettingsPatchIn, opts?: WriteOpts) {
      await wait();
      const key = opts?.idempotencyKey;
      const before = key ? done.get(key) : undefined;
      if (before) return copy(before);
      const body = p as unknown as Record<string, unknown>;
      const sections = SECTIONS.filter((s) => s in body);
      if (
        sections.length !== 1 ||
        typeof body.version !== "number" ||
        !Number.isInteger(body.version)
      )
        fail(422, "invalid");
      if (body.version !== settings.version) fail(409, "conflict");
      const section = sections[0]!;
      const people = await staff();
      const next = apply(body, section, people);
      const actor = await myName(people);
      settings = {
        ...next,
        updated_by: { display_name: actor },
        updated_at: iso(now()),
        version: settings.version + 1,
      };
      log(EVENT[section], actor);
      if (key) done.set(key, copy(settings));
      return copy(settings);
    },
  };
}
