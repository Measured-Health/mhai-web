/**
 * A person's devices, from core's `GET /auth/sessions` (openapi `SessionList`:
 * `{sessions: [{id, created_at, last_seen_at, ua_summary, ip_prefix, current}]}`),
 * as both apps' account pages show them. Read strictly: anything else
 * throws, and the BFF answers 503 (fail closed, never a guess). The network
 * prefix is never passed on: the page shows the device and when it was last
 * used, nothing about where.
 */
export interface DeviceOut {
  id: string;
  /** e.g. "Chrome on Windows". */
  label: string;
  place: null;
  /** Epoch ms. */
  lastActiveAt: number;
  current: boolean;
}

const ID = /^[A-Za-z0-9-]{1,64}$/;
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_LABEL = 200;
const MAX_SESSIONS = 200;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function time(v: unknown): number {
  if (typeof v !== "string" || !INSTANT.test(v)) throw new TypeError("time");
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new TypeError("time");
  return t;
}

export function readSessionList(raw: unknown): DeviceOut[] {
  if (!isObject(raw) || !Array.isArray(raw.sessions))
    throw new TypeError("not a session list");
  if (raw.sessions.length > MAX_SESSIONS) throw new TypeError("too many");
  return raw.sessions.map((s: unknown) => {
    if (!isObject(s)) throw new TypeError("session");
    const { id, last_seen_at, ua_summary, current } = s;
    if (typeof id !== "string" || !ID.test(id)) throw new TypeError("id");
    if (typeof current !== "boolean") throw new TypeError("current");
    if (
      ua_summary !== null &&
      (typeof ua_summary !== "string" || ua_summary.length > MAX_LABEL)
    )
      throw new TypeError("ua_summary");
    time(s.created_at);
    const label = ua_summary?.trim() || "Unknown device";
    return {
      id,
      label,
      place: null,
      lastActiveAt: time(last_seen_at),
      current,
    };
  });
}
