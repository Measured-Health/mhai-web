// The demo's record connections (Plan 13), built on the mock core. Memory
// only. It refuses what the backend refuses (spec §8), with the same codes.
// Credentials are kept apart from everything a reply is built from, so no
// reply can carry one.
import { ApiError } from "@mhai/api-client/errors";
import { connectionState, validateConnection } from "@/lib/emr/state";
import type { Person, TeamMember } from "./contract";
import {
  SECRET_MAX,
  type ConnectionsQuery,
  type ConnectorType,
  type EmrClient,
  type EmrConnection,
  type EmrConnectionSummary,
} from "./emr-contract";
import {
  CONNECTOR_TYPES,
  healthOf,
  seedConnections,
  type ConnectionRecord,
} from "./emr-fixtures";
import type { MockCore } from "./mock";

const D = 24 * 3_600_000;
const MAX_ERRORS = 5;
const STATES = ["all", "needs_attention", "off", "not_connected"];

const iso = (ms: number) => new Date(ms).toISOString();
const fail = (status: number, code: string): never => {
  throw new ApiError(status, code);
};
const invalid = (): never => fail(422, "invalid");
const person = (m: TeamMember): Person => ({ id: m.id, name: m.name });

/** A plain object of strings, else 422. */
function strings(v: unknown): Record<string, string> {
  if (v === undefined) return {};
  if (v === null || typeof v !== "object" || Array.isArray(v)) invalid();
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as object)) {
    if (typeof x !== "string") invalid();
    out[k] = x;
  }
  return out;
}
/** Only the type's own keys of this kind, else 422. */
function onlyKeys(
  v: Record<string, string>,
  type: ConnectorType,
  kind: "text" | "secret",
) {
  const keys = type.fields.filter((f) => f.kind === kind).map((f) => f.key);
  if (Object.keys(v).some((k) => !keys.includes(k))) invalid();
}
const str = (v: unknown): string => (typeof v === "string" ? v : invalid());
/** The version the person saw, which every change sends; else 422. */
function versionOf(body: unknown): number {
  const v = (body as { version?: unknown } | null)?.version;
  return typeof v === "number" ? v : invalid();
}
/** The text fields as kept: trimmed, empty ones left out. */
function cleanSettings(v: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (x.trim()) out[k] = x.trim();
  return out;
}
const sameSettings = (a: Record<string, string>, b: Record<string, string>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => b[k] === v);

export function emrMock(core: MockCore): EmrClient {
  const { now, log } = core;
  const records: ConnectionRecord[] = seedConnections(now());
  /**
   * The credentials typed, by connection id. Never read back: nothing a
   * reply is built from comes from here.
   */
  const vault = new Map<string, Map<string, string>>();

  const typeOf = (id: unknown): ConnectorType | null =>
    CONNECTOR_TYPES.find((t) => t.id === id) ?? null;
  const theType = (r: ConnectionRecord) => typeOf(r.type)!;
  const find = (id: string) =>
    records.find((r) => r.id === id) ?? fail(404, "not_found");
  const hospitalOf = (r: ConnectionRecord): Person => {
    const h = core.hospitals().find((x) => x.hospital.id === r.hospital_id);
    return { id: r.hospital_id, name: h?.hospital.name ?? "" };
  };
  /** The last 24 hours' problems, newest first, at most 5. */
  const recent = (r: ConnectionRecord) =>
    r.errors
      .filter((e) => Date.parse(e.at) > now() - D)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  function summary(r: ConnectionRecord): EmrConnectionSummary {
    const errors_24h = recent(r).reduce((n, e) => n + e.count, 0);
    return {
      id: r.id,
      hospital: hospitalOf(r),
      type: r.type,
      type_label: theType(r).label,
      source_label: r.source_label,
      enabled: r.enabled,
      health: healthOf(r.synced, errors_24h),
      last_test: r.last_test,
      last_sync: r.last_sync,
      errors_24h,
    };
  }
  /** A connection as a reply shows it: when each secret was set, never it. */
  function full(r: ConnectionRecord): EmrConnection {
    return {
      ...summary(r),
      base_url: r.base_url,
      settings: { ...r.settings },
      credentials: theType(r)
        .fields.filter((f) => f.kind === "secret")
        .map((f) => ({ key: f.key, set_at: r.credentials_set[f.key] ?? null })),
      errors: recent(r).slice(0, MAX_ERRORS),
      updated_by: r.updated_by,
      updated_at: r.updated_at,
      version: r.version,
    };
  }
  /** Keeps the typed credentials apart; records only when each was set. */
  function store(r: ConnectionRecord, creds: Record<string, string>) {
    const kept = vault.get(r.id) ?? new Map<string, string>();
    for (const [k, v] of Object.entries(creds)) {
      kept.set(k, v);
      r.credentials_set[k] = iso(now());
    }
    vault.set(r.id, kept);
  }
  const entry = (r: ConnectionRecord) => ({
    hospital: hospitalOf(r),
    target: r.source_label,
  });

  return {
    listConnectorTypes: () => core.read(() => ({ types: CONNECTOR_TYPES })),

    listConnections: (q: ConnectionsQuery) =>
      core.read(() => {
        const state = q.state ?? "all";
        if (!STATES.includes(state)) invalid();
        const inHospital = (id: string) => !q.hospital || id === q.hospital;
        const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
        const connections = records
          .filter((r) => inHospital(r.hospital_id))
          .map(summary)
          .filter((c) => {
            const s = connectionState(c);
            if (state === "needs_attention") return s === "needs_attention";
            if (state === "off") return s === "off" || s === "not_tested";
            return state === "all";
          })
          .sort(
            (a, b) =>
              byName(a.hospital.name, b.hospital.name) ||
              byName(a.source_label, b.source_label),
          );
        const not_connected =
          state === "all" || state === "not_connected"
            ? core
                .hospitals()
                .map((x) => x.hospital)
                .filter(
                  (h) =>
                    h.status !== "removed" &&
                    inHospital(h.id) &&
                    !records.some((r) => r.hospital_id === h.id),
                )
                .map((h): Person => ({ id: h.id, name: h.name }))
                .sort((a, b) => byName(a.name, b.name))
            : [];
        return { connections, not_connected };
      }),

    getConnection: (id) => core.read(() => full(find(id))),

    addConnection: (hospitalId, body, opts) =>
      core.write(opts, async (m) => {
        const h = core.findHospital(hospitalId).hospital;
        if (h.status === "removed") fail(409, "hospital_removed");
        const b = (body ?? {}) as unknown as Record<string, unknown>;
        const type = typeOf(b.type) ?? fail(422, "no_type");
        const settings = strings(b.settings);
        const credentials = strings(b.credentials);
        onlyKeys(settings, type, "text");
        onlyKeys(credentials, type, "secret");
        const form = {
          source_label: str(b.source_label),
          base_url: str(b.base_url),
          settings,
          credentials,
        };
        if (Object.keys(validateConnection(form, type, "add")).length > 0)
          invalid();
        await core.checkCode(m, body);
        const r: ConnectionRecord = {
          id: core.newId("emr"),
          hospital_id: h.id,
          type: type.id,
          source_label: form.source_label.trim(),
          base_url: form.base_url.trim(),
          settings: cleanSettings(settings),
          credentials_set: Object.fromEntries(
            type.fields
              .filter((f) => f.kind === "secret")
              .map((f) => [f.key, null]),
          ),
          enabled: false,
          synced: false,
          last_test: null,
          last_sync: null,
          errors: [],
          updated_by: person(m),
          updated_at: iso(now()),
          version: 1,
          test_result: null,
        };
        store(
          r,
          Object.fromEntries(Object.entries(credentials).filter(([, v]) => v)),
        );
        records.push(r);
        log(person(m), "emr_connection_added", entry(r));
        return full(r);
      }),

    updateConnection: (id, body, opts) =>
      core.write(opts, async (m) => {
        const r = find(id);
        const b = (body ?? {}) as unknown as Record<string, unknown>;
        if (versionOf(b) !== r.version) fail(409, "conflict");
        const type = theType(r);
        const patch = strings(b.settings);
        const credentials = strings(b.credentials);
        onlyKeys(patch, type, "text");
        onlyKeys(credentials, type, "secret");
        // A credential sent is one being replaced: never empty.
        if (Object.values(credentials).some((v) => !v || v.length > SECRET_MAX))
          invalid();
        const form = {
          source_label:
            b.source_label === undefined ? r.source_label : str(b.source_label),
          base_url: b.base_url === undefined ? r.base_url : str(b.base_url),
          settings: { ...r.settings, ...patch },
          credentials,
        };
        if (Object.keys(validateConnection(form, type, "edit")).length > 0)
          invalid();
        await core.checkCode(m, body);
        const settings = cleanSettings(form.settings);
        const base_url = form.base_url.trim();
        const replaced = Object.keys(credentials).length > 0;
        // Anything but the name voids the last test: test again before on.
        const changed =
          base_url !== r.base_url ||
          !sameSettings(settings, r.settings) ||
          replaced;
        r.source_label = form.source_label.trim();
        r.base_url = base_url;
        r.settings = settings;
        if (replaced) {
          store(r, credentials);
          // New credentials may fix what the sample's test found.
          r.test_result = null;
        }
        if (changed) r.last_test = null;
        r.version++;
        r.updated_by = person(m);
        r.updated_at = iso(now());
        log(person(m), "emr_connection_changed", {
          ...entry(r),
          detail: replaced ? "Credentials replaced" : null,
        });
        return full(r);
      }),

    setConnectionEnabled: (id, body, opts) =>
      core.write(opts, async (m) => {
        const r = find(id);
        const b = (body ?? {}) as unknown as Record<string, unknown>;
        if (versionOf(b) !== r.version) fail(409, "conflict");
        if (typeof b.enabled !== "boolean") invalid();
        const on = b.enabled === true;
        if (on && r.last_test?.ok !== true) fail(409, "not_tested");
        await core.checkCode(m, body);
        if (r.enabled === on) return full(r);
        r.enabled = on;
        r.version++;
        r.updated_by = person(m);
        r.updated_at = iso(now());
        log(
          person(m),
          on ? "emr_connection_switched_on" : "emr_connection_switched_off",
          entry(r),
        );
        return full(r);
      }),

    // No code: it changes nothing a version guards, but it is recorded.
    testConnection: (id, opts) =>
      core.write(opts, (m) => {
        const r = find(id);
        const missing = theType(r).fields.some(
          (f) => f.kind === "secret" && f.required && !r.credentials_set[f.key],
        );
        const code =
          r.test_result ??
          (missing || r.base_url.includes("fail") ? "sign_in_refused" : null);
        r.last_test = { at: iso(now()), ok: code === null, code };
        // A pass means the problems are fixed: the demo shows it as Connected.
        if (code === null) r.errors = [];
        log(person(m), "emr_connection_tested", entry(r));
        return full(r);
      }),
  };
}
