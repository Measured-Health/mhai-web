import "server-only";

/**
 * One BFF request as one NATS message on `api.v1.<app>`, and core's reply
 * back as a `Response` (mhai-multiagent, services/core/internal/natsapi).
 * Pure functions, no I/O. Anything the adapter would refuse, or that can't
 * be sent exactly, throws a `MappingError` (the callers answer 503); the one
 * exception is a body over 64 KB, answered here as core would (413).
 *
 * Errors carry a fixed message only, never a header value, path or body.
 */

export type BackendApp = "clinical" | "platform";

/** The only origin a URL may have on the NATS transport (it never resolves). */
export const NATS_API_ORIGIN = "http://core.nats.invalid";
/** httpx.MaxBody. */
export const MAX_BODY = 64 * 1024;
/** natsapi.MaxPath: path and query, in bytes. */
export const MAX_PATH = 2048;
/** The longest header value sent. */
export const MAX_HEADER_VALUE = 4096;
/** callUpstream's timeout, used when the caller gives none. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export const METHOD_HEADER = "Mhai-Method"; // natsapi.HeaderMethod
export const PATH_HEADER = "Mhai-Path"; // natsapi.HeaderPath
export const TIMEOUT_HEADER = "Mhai-Timeout-Ms"; // natsapi.HeaderTimeout
export const STATUS_HEADER = "Mhai-Status-Code"; // natsapi.HeaderStatus

/** natsapi.RequestHeaders: the only headers sent, spelled as here. */
export const REQUEST_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "If-None-Match",
  "X-MHAI-Client-IP",
  "traceparent",
] as const;

/** natsapi.ResponseHeaders: the only reply headers kept. */
export const REPLY_HEADERS = [
  "Content-Type",
  "Cache-Control",
  "ETag",
  "Retry-After",
  "X-Request-ID",
  "Idempotent-Replayed",
  "Deprecation",
  "Sunset",
  "Link",
  "X-Content-Type-Options",
] as const;

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const API_PREFIX = "/api/v1/";
/**
 * Headers a `Headers` object would join with ", " when given twice; none of
 * them ever holds ", " legitimately, so ", " in one is a repeat.
 */
const SINGLE_TOKEN = new Set([
  "authorization",
  "idempotency-key",
  "x-mhai-client-ip",
]);
const NULL_BODY = new Set([204, 205, 304]);

export type NatsRequestSpec = {
  subject: `api.v1.${BackendApp}`;
  headers: [name: string, value: string][];
  data: Uint8Array;
  /** How long the BFF waits for the reply. */
  timeoutMs: number;
};

/** A spec to send, or a Response for a request answered without core (R6). */
export type Mapped =
  | { kind: "send"; spec: NatsRequestSpec }
  | { kind: "answer"; response: Response };

export type NatsReplyHeaders = {
  get(k: string): string;
  values(k: string): string[];
  keys(): string[];
  /** Set by nats.js on a status message (no responders, ...). */
  hasError?: boolean;
};

export type NatsReply = { headers?: NatsReplyHeaders; data: Uint8Array };

export class MappingError extends Error {
  constructor(what: string) {
    super(`nats mapping: ${what}`);
    this.name = "MappingError";
  }
}

export function subjectFor(app: BackendApp): `api.v1.${BackendApp}` {
  if (app !== "clinical" && app !== "platform")
    throw new MappingError("unknown app");
  return `api.v1.${app}`;
}

/** Printable ASCII (0x20–0x7e): no control byte, CR, LF, NUL or non-ASCII. */
function printable(v: string, allowSpace: boolean): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c > 0x7e || c < 0x20 || (!allowSpace && c === 0x20)) return false;
  }
  return true;
}

/** The pairs as given: a `Headers`, an array of pairs or a record. */
function pairsOf(h: HeadersInit | undefined): {
  pairs: [string, string][];
  joined: boolean;
} {
  if (!h) return { pairs: [], joined: false };
  if (h instanceof Headers) return { pairs: [...h.entries()], joined: true };
  if (Array.isArray(h)) {
    return {
      pairs: h.map((p) => {
        if (p.length !== 2) throw new MappingError("malformed header pair");
        return [String(p[0]), String(p[1])];
      }),
      joined: false,
    };
  }
  return {
    pairs: Object.entries(h as Record<string, string>).map(([k, v]) => [
      k,
      String(v),
    ]),
    joined: false,
  };
}

const allowedName = new Map(
  REQUEST_HEADERS.map((n) => [n.toLowerCase(), n] as const),
);

function mapHeaders(h: HeadersInit | undefined): [string, string][] {
  const { pairs, joined } = pairsOf(h);
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const [name, value] of pairs) {
    const lower = name.toLowerCase();
    const canonical = allowedName.get(lower);
    if (!canonical) continue; // dropped: never sent to core
    if (seen.has(lower)) throw new MappingError("header given twice");
    if (
      value.length < 1 ||
      value.length > MAX_HEADER_VALUE ||
      !printable(value, true)
    )
      throw new MappingError("header value not printable ASCII");
    if (joined && SINGLE_TOKEN.has(lower) && value.includes(", "))
      throw new MappingError("header given twice");
    seen.add(lower);
    out.push([canonical, value]);
  }
  return out;
}

/** Path and query: under /api/v1/, printable ASCII, no fragment, ≤ 2048 bytes. */
function pathOf(url: string): string {
  if (!url.startsWith(`${NATS_API_ORIGIN}/`))
    throw new MappingError("not the NATS API origin");
  const p = url.slice(NATS_API_ORIGIN.length);
  if (
    !p.startsWith(API_PREFIX) ||
    p.length > MAX_PATH ||
    !printable(p, false) ||
    p.includes("#")
  )
    throw new MappingError("path refused");
  return p;
}

function bodyOf(body: BodyInit | null | undefined): Uint8Array {
  if (body === undefined || body === null) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  throw new MappingError("body must be a string or bytes");
}

function timeoutOf(t: number | undefined): number {
  const total = t ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(total) || total <= 0)
    throw new MappingError("timeout refused");
  return total;
}

/** The reply core gives a body over httpx.MaxBody, built here. */
function tooLarge(app: BackendApp): Response {
  const platform = app === "platform";
  return new Response(
    JSON.stringify(
      platform
        ? { code: "payload_too_large" }
        : { code: "payload_too_large", status: 413 },
    ),
    {
      status: 413,
      headers: {
        "Content-Type": platform
          ? "application/json"
          : "application/problem+json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function toNatsRequest(
  app: BackendApp,
  url: string,
  init: {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    timeoutMs?: number;
  },
): Mapped {
  const subject = subjectFor(app);
  const method = (init.method ?? "GET").toUpperCase();
  if (!METHODS.has(method)) throw new MappingError("method refused");
  const path = pathOf(url);
  const headers = mapHeaders(init.headers);
  const timeoutMs = timeoutOf(init.timeoutMs);
  const data = bodyOf(init.body);
  if (data.byteLength > MAX_BODY)
    return { kind: "answer", response: tooLarge(app) };
  // Core gives up half a second before the BFF does (R5).
  const coreTimeout = Math.max(1000, Math.floor(timeoutMs) - 500);
  return {
    kind: "send",
    spec: {
      subject,
      headers: [
        [METHOD_HEADER, method],
        [PATH_HEADER, path],
        [TIMEOUT_HEADER, String(coreTimeout)],
        ...headers,
      ],
      data,
      timeoutMs,
    },
  };
}

/** Every value of `name` in any case (NATS header names are case-sensitive). */
function valuesOf(h: NatsReplyHeaders, name: string): string[] {
  const lower = name.toLowerCase();
  const out: string[] = [];
  for (const k of h.keys())
    if (k.toLowerCase() === lower) out.push(...h.values(k));
  return out;
}

export function fromNatsReply(
  app: BackendApp,
  method: string,
  reply: NatsReply,
): Response {
  subjectFor(app);
  const h = reply.headers;
  if (!h) throw new MappingError("reply without headers");
  if (h.hasError === true) throw new MappingError("NATS status reply");
  const statuses = valuesOf(h, STATUS_HEADER);
  if (statuses.length !== 1 || !/^[0-9]{3}$/.test(statuses[0]!))
    throw new MappingError("reply status refused");
  const status = Number(statuses[0]);
  if (status < 200 || status > 599)
    throw new MappingError("reply status refused");
  const headers = new Headers();
  for (const name of REPLY_HEADERS)
    for (const v of valuesOf(h, name)) headers.append(name, v);
  const noBody = method.toUpperCase() === "HEAD" || NULL_BODY.has(status);
  return new Response(noBody ? null : (reply.data as Uint8Array<ArrayBuffer>), {
    status,
    headers,
  });
}
