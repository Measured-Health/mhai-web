import "server-only";
import { readFileSync } from "node:fs";
import {
  headers as natsHeaders,
  nkeyAuthenticator,
  usernamePasswordAuthenticator,
  type NatsConnection,
} from "@nats-io/nats-core";
import { connect as natsConnect } from "@nats-io/transport-node";
import { defaultLog, formatLog, type LogLine } from "../log";
import { readNatsConfig, type NatsConfig } from "./config";
import type { BackendApp, NatsReply } from "./mapping";

/**
 * The BFF's one NATS connection per app process (Design, "The NATS
 * client"). Server only: never imported by client code (ESLint and
 * check:no-nats hold this).
 */

/** Every failure on the NATS path: the callers answer 503 `unavailable`. */
export class BackendUnavailable extends Error {
  constructor(cause: string) {
    // The class name of what failed, never its message (which can hold a
    // subject, a server URL or a path).
    super(
      `backend unavailable (${/^[A-Za-z0-9_]{1,64}$/.test(cause) ? cause : "Error"})`,
    );
    this.name = "BackendUnavailable";
  }
}

export interface NatsRequester {
  request(
    subject: string,
    data: Uint8Array,
    opts: {
      headers: [string, string][];
      timeoutMs: number;
      signal?: AbortSignal;
    },
  ): Promise<NatsReply>;
  /** True only while connected. */
  ready(): boolean;
  /** Drains the connection (tests and shutdown). */
  close?(): Promise<void>;
}

type ConnectOptions = Parameters<typeof natsConnect>[0];

export type ConnectDeps = {
  connect: (opts: ConnectOptions) => Promise<NatsConnection>;
  env: Record<string, string | undefined>;
  readFile: (p: string) => Buffer;
  log: LogLine;
  /** Registers the SIGTERM handler. */
  onShutdown: (fn: () => Promise<void>) => void;
  /** How long to wait before opening again after NATS closed the connection. */
  reopenAfterMs?: number;
};

const RECONNECT_WAIT_MS = 2000;
const RECONNECT_JITTER_MS = 500;
const PING_INTERVAL_MS = 20_000;
const MAX_PINGS_OUT = 2;
const DRAIN_CAP_MS = 5000;

const key = (app: BackendApp) => Symbol.for(`mhai.nats.${app}`);
type Slot = Record<symbol, NatsRequester | undefined>;
const slots = globalThis as unknown as Slot;

function authenticatorFor(auth: NatsConfig["auth"]) {
  if (auth.kind === "nkey") {
    // nats.js signs the server's nonce with this on every (re)connect, so
    // it keeps this private copy; the file's buffer was zeroed on read.
    const seed = auth.seed;
    return nkeyAuthenticator(() => seed);
  }
  const { user, pass } = auth;
  return usernamePasswordAuthenticator(
    () => user,
    () => pass,
  );
}

function optionsFor(app: BackendApp, cfg: NatsConfig): ConnectOptions {
  return {
    servers: cfg.servers,
    name: cfg.name,
    inboxPrefix: cfg.inboxPrefix,
    authenticator: authenticatorFor(cfg.auth),
    ...(cfg.tls
      ? {
          tls: {
            caFile: cfg.tls.ca,
            certFile: cfg.tls.cert,
            keyFile: cfg.tls.key,
          },
        }
      : {}),
    maxReconnectAttempts: -1,
    reconnectTimeWait: RECONNECT_WAIT_MS,
    reconnectJitter: RECONNECT_JITTER_MS,
    reconnectJitterTLS: RECONNECT_JITTER_MS,
    waitOnFirstConnect: true,
    pingInterval: PING_INTERVAL_MS,
    maxPingOut: MAX_PINGS_OUT,
    noAsyncTraces: true,
    debug: false,
    verbose: false,
  } as ConnectOptions;
}

const errorName = (e: unknown) =>
  e instanceof Error
    ? e.name === "RequestError" && e.cause instanceof Error
      ? e.cause.name
      : e.name
    : "Error";

function refusedRequester(): NatsRequester {
  return {
    ready: () => false,
    request: () => Promise.reject(new BackendUnavailable("ConfigRefused")),
  };
}

function liveRequester(
  app: BackendApp,
  cfg: NatsConfig,
  deps: ConnectDeps,
): NatsRequester {
  let nc: NatsConnection | null = null;
  let connected = false;
  let drained: Promise<void> | null = null;
  const log = (event: string, error?: string) =>
    deps.log(formatLog(event, { app, ...(error ? { error } : {}) }));

  const watch = async (conn: NatsConnection) => {
    void conn.closed().then(() => {
      connected = false;
      log("nats: closed");
      // Closed by NATS (reconnects given up, say after an auth refusal),
      // not by a drain: open a new connection rather than stay down until
      // the container restarts.
      if (!drained)
        setTimeout(open, deps.reopenAfterMs ?? RECONNECT_WAIT_MS).unref?.();
    });
    for await (const s of conn.status()) {
      switch (s.type) {
        case "disconnect":
          connected = false;
          log("nats: disconnected");
          break;
        case "reconnecting":
          connected = false;
          log("nats: reconnecting");
          break;
        case "reconnect":
          connected = !conn.isClosed();
          log("nats: connected");
          break;
        case "error":
          log("nats: error", errorName(s.error));
          break;
        default:
          break; // pings, cluster updates: nothing to log
      }
    }
  };

  const open = () => {
    deps
      .connect(optionsFor(app, cfg))
      .then((conn) => {
        nc = conn;
        connected = !conn.isClosed();
        log("nats: connected");
        void watch(conn).catch(() => {});
      })
      .catch((e: unknown) => {
        // waitOnFirstConnect retries on its own; this is an auth refusal or
        // a bad option. Try again later, as a reconnect would.
        log("nats: connect failed", errorName(e));
        setTimeout(open, RECONNECT_WAIT_MS).unref?.();
      });
  };
  open();

  const drain = () => {
    drained ??= (async () => {
      const conn = nc;
      connected = false;
      if (!conn || conn.isClosed()) return;
      await Promise.race([
        conn.drain().catch(() => {}),
        new Promise<void>((r) => setTimeout(r, DRAIN_CAP_MS).unref?.()),
      ]);
    })();
    return drained;
  };
  deps.onShutdown(drain);

  return {
    close: drain,
    ready: () => connected && nc !== null && !nc.isClosed(),
    async request(subject, data, { headers, timeoutMs, signal }) {
      const conn = nc;
      // Fail fast while down rather than wait in nats.js's reconnect buffer.
      if (!connected || !conn || conn.isClosed())
        throw new BackendUnavailable("NotConnected");
      if (signal?.aborted) throw new BackendUnavailable("AbortError");
      let h;
      try {
        h = natsHeaders();
        for (const [k, v] of headers) h.append(k, v);
      } catch (e) {
        throw new BackendUnavailable(errorName(e));
      }
      let onAbort: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new BackendUnavailable("AbortError"));
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      try {
        const msg = await Promise.race([
          conn.request(subject, data, { timeout: timeoutMs, headers: h }),
          aborted,
        ]);
        return { headers: msg.headers, data: msg.data };
      } catch (e) {
        if (e instanceof BackendUnavailable) throw e;
        throw new BackendUnavailable(errorName(e));
      } finally {
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** A new requester with its own connection (not the process's one). */
export function openNatsRequester(
  app: BackendApp,
  deps: ConnectDeps,
): NatsRequester {
  const cfg = readNatsConfig(app, deps.env, deps.readFile);
  if ("refused" in cfg) {
    deps.log(formatLog(`nats: config refused (${cfg.refused})`, { app }));
    return refusedRequester();
  }
  return liveRequester(app, cfg, deps);
}

/** The app's requester, made once per process (tests pass their own deps). */
export function createNatsRequester(
  app: BackendApp,
  deps: ConnectDeps,
): NatsRequester {
  const existing = slots[key(app)];
  if (existing) return existing;
  const r = openNatsRequester(app, deps);
  slots[key(app)] = r;
  return r;
}

function processDeps(): ConnectDeps {
  return {
    connect: natsConnect,
    env: process.env,
    readFile: (p) => readFileSync(p),
    log: defaultLog,
    onShutdown: (fn) => {
      process.once("SIGTERM", () => {
        // Another handler (Next's server) exits the process; if none is
        // left, exit once drained, as the default handler would have.
        const others = process.listenerCount("SIGTERM") > 0;
        void fn().finally(() => {
          if (!others) process.exit(0);
        });
      });
    },
  };
}

/** The per-process singleton for `app`. */
export function natsRequester(app: BackendApp): NatsRequester {
  return slots[key(app)] ?? createNatsRequester(app, processDeps());
}

/** Tests: install a fake core (or null to clear) for `app`. */
export function __setNatsRequesterForTests(
  app: BackendApp,
  r: NatsRequester | null,
): void {
  slots[key(app)] = r ?? undefined;
}

export function __resetNatsForTests(): void {
  for (const app of ["clinical", "platform"] as const)
    slots[key(app)] = undefined;
}
