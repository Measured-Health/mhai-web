import "server-only";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { defaultLog, formatLog, type LogLine } from "./log";
import {
  BackendUnavailable,
  natsRequester,
  type NatsRequester,
} from "./nats/connection";
import {
  NATS_API_ORIGIN,
  fromNatsReply,
  toNatsRequest,
  type BackendApp,
} from "./nats/mapping";

/**
 * The BFF's one way to reach core (R1): a `fetch`-shaped function per app,
 * switched by BACKEND_TRANSPORT.
 *
 *   http (default)  fetch, plus X-MHAI-Client-IP and X-MHAI-Service (R3, R4)
 *   nats            one NATS request on api.v1.<app> (toNatsRequest)
 *   anything else   every call rejects; logged once
 *
 * Every failure rejects, and the callers' existing catch answers 503
 * `unavailable`. No retries here (R11).
 */

export { NATS_API_ORIGIN };
export type { BackendApp };

export type BackendInit = RequestInit & {
  /** How long the caller waits; sent to core as Mhai-Timeout-Ms on NATS (R5). */
  timeoutMs?: number;
};
export type BackendFetch = (
  url: string,
  init?: BackendInit,
) => Promise<Response>;

type Env = Record<string, string | undefined>;
type Transport = "http" | "nats" | null;

export function backendTransport(env: Env = process.env): Transport {
  const t = env.BACKEND_TRANSPORT;
  if (t === undefined || t === "" || t === "http") return "http";
  if (t === "nats") return "nats";
  return null;
}

const CLIENT_IP = "X-MHAI-Client-IP";
const SERVICE = "X-MHAI-Service";
const SERVICE_KEY = /^[\x21-\x7e]{1,4096}$/;

const validIp = (v: string | undefined) =>
  v !== undefined && isIP(v) !== 0 ? v : undefined;

/** The caller's headers plus `extra`, any caller value for those names replaced. */
function withHeaders(
  h: HeadersInit | undefined,
  extra: Record<string, string>,
): HeadersInit | undefined {
  const names = new Set([CLIENT_IP, SERVICE].map((n) => n.toLowerCase()));
  if (!h || Array.isArray(h) || h instanceof Headers) {
    const out = new Headers(h);
    for (const n of names) out.delete(n);
    for (const [k, v] of Object.entries(extra)) out.set(k, v);
    return out;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h))
    if (!names.has(k.toLowerCase())) out[k] = v;
  return { ...out, ...extra };
}

function hasAny(h: HeadersInit | undefined): boolean {
  if (!h) return false;
  const lower = [CLIENT_IP, SERVICE].map((n) => n.toLowerCase());
  const keys =
    h instanceof Headers
      ? [...h.keys()]
      : Array.isArray(h)
        ? h.map(([k]) => k)
        : Object.keys(h);
  return keys.some((k) => lower.includes(k.toLowerCase()));
}

export function createBackendFetch(opts: {
  app: BackendApp;
  /** The end user's IP, read inside the request (R3); undefined outside one. */
  clientIp: () => Promise<string | undefined>;
  env?: Env;
  /** Tests pass the fake core. */
  requester?: NatsRequester;
  readFile?: (p: string) => Buffer;
  log?: LogLine;
}): BackendFetch {
  const { app, clientIp } = opts;
  const env = () => opts.env ?? process.env;
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p));
  const log = opts.log ?? defaultLog;
  let refusedLogged = false;
  let keyRefusedLogged = false;
  let key: { path: string; value: string | undefined } | null = null;

  /** BFF_SERVICE_KEY_FILE's key, read once per path; HTTP only (R4). */
  const serviceKey = (): string | undefined => {
    const path = env().BFF_SERVICE_KEY_FILE;
    if (!path) return undefined;
    if (key?.path !== path) {
      let value: string | undefined;
      try {
        const v = readFile(path).toString("utf8").replace(/\s+$/, "");
        value = SERVICE_KEY.test(v) ? v : undefined;
      } catch {
        value = undefined;
      }
      if (value === undefined && !keyRefusedLogged) {
        keyRefusedLogged = true;
        log(
          formatLog("backend: config refused (BFF_SERVICE_KEY_FILE)", { app }),
        );
      }
      key = { path, value };
    }
    return key.value;
  };

  const viaHttp: BackendFetch = async (url, init = {}) => {
    const { timeoutMs: _timeout, ...rest } = init;
    void _timeout; // the caller's signal carries it on HTTP
    const ip = validIp(await clientIp());
    const svc = serviceKey();
    const extra: Record<string, string> = {
      ...(ip ? { [CLIENT_IP]: ip } : {}),
      ...(svc ? { [SERVICE]: svc } : {}),
    };
    const headers =
      Object.keys(extra).length || hasAny(rest.headers)
        ? withHeaders(rest.headers, extra)
        : rest.headers;
    return fetch(url, { ...rest, headers, cache: "no-store" });
  };

  const viaNats: BackendFetch = async (url, init = {}) => {
    const started = Date.now();
    const method = (init.method ?? "GET").toUpperCase();
    try {
      const ip = validIp(await clientIp());
      const headers = withHeaders(init.headers, ip ? { [CLIENT_IP]: ip } : {});
      const mapped = toNatsRequest(app, url, {
        method,
        headers,
        body: init.body,
        timeoutMs: init.timeoutMs,
      });
      if (mapped.kind === "answer") return mapped.response;
      const { spec } = mapped;
      const requester = opts.requester ?? natsRequester(app);
      const reply = await requester.request(spec.subject, spec.data, {
        headers: spec.headers,
        timeoutMs: spec.timeoutMs,
        signal: init.signal ?? undefined,
      });
      const res = fromNatsReply(app, method, reply);
      if (res.status >= 500)
        log(
          formatLog("backend: reply", {
            app,
            method,
            status: res.status,
            duration_ms: Date.now() - started,
            request_id: res.headers.get("X-Request-ID") ?? undefined,
          }),
        );
      return res;
    } catch (e) {
      const name =
        e instanceof BackendUnavailable
          ? (/\(([A-Za-z0-9_]+)\)/.exec(e.message)?.[1] ?? "Error")
          : e instanceof Error
            ? e.name
            : "Error";
      // A9: method, class and duration only, never the path or query.
      log(
        formatLog("backend: unavailable", {
          app,
          method,
          status: 503,
          duration_ms: Date.now() - started,
          error: name,
        }),
      );
      throw e instanceof BackendUnavailable ? e : new BackendUnavailable(name);
    }
  };

  return (url, init) => {
    switch (backendTransport(env())) {
      case "http":
        return viaHttp(url, init);
      case "nats":
        return viaNats(url, init);
      default:
        if (!refusedLogged) {
          refusedLogged = true;
          log(
            formatLog("backend: transport refused (BACKEND_TRANSPORT)", {
              app,
            }),
          );
        }
        return Promise.reject(new BackendUnavailable("TransportRefused"));
    }
  };
}

/** Whether the app can reach core now: http always; nats while connected. */
export function backendReady(
  app: BackendApp,
  opts: { env?: Env; requester?: NatsRequester } = {},
): boolean {
  switch (backendTransport(opts.env ?? process.env)) {
    case "http":
      return true;
    case "nats":
      return (opts.requester ?? natsRequester(app)).ready();
    default:
      return false;
  }
}
