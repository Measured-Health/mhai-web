// @vitest-environment node
import { createInbox, type Status } from "@nats-io/nats-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendUnavailable,
  __resetNatsForTests,
  createNatsRequester,
  type ConnectDeps,
} from "./connection";

const SEED = `SU${"B".repeat(56)}`;
const PASSWORD = "kSuperSecretPassword";
const TOKEN = "Bearer tok-SECRET";
const BODY = '{"patient":"SECRET-BODY"}';
const PATH = "/api/v1/queries?mrn=SECRET-PATH";

/** A fake nats.js connection: records options, emits status events. */
function fakeNats() {
  const listeners: ((s: Status) => void)[] = [];
  const queue: Status[] = [];
  let closed = false;
  let resolveClosed!: () => void;
  const closedP = new Promise<void>((r) => (resolveClosed = r));
  const nc = {
    request: vi.fn(async () => ({
      headers: undefined,
      data: new Uint8Array(),
    })),
    status() {
      return {
        [Symbol.asyncIterator]() {
          return {
            next: () =>
              new Promise<IteratorResult<Status>>((resolve) => {
                const s = queue.shift();
                if (s) return resolve({ value: s, done: false });
                listeners.push((v) => resolve({ value: v, done: false }));
              }),
          };
        },
      };
    },
    closed: () => closedP,
    isClosed: () => closed,
    drain: vi.fn(async () => {
      closed = true;
      resolveClosed();
    }),
  };
  const emit = (s: Status) => {
    const l = listeners.shift();
    if (l) l(s);
    else queue.push(s);
  };
  const close = () => {
    closed = true;
    resolveClosed();
  };
  return { nc, emit, close };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function deps(over: Partial<ConnectDeps> = {}) {
  const f = fakeNats();
  const logs: string[] = [];
  const shutdown: (() => Promise<void>)[] = [];
  const connect = vi.fn<(opts: Record<string, unknown>) => Promise<unknown>>(
    async () => f.nc,
  );
  const d: ConnectDeps = {
    connect: connect as unknown as ConnectDeps["connect"],
    env: {
      MHAI_DEPLOY_ENV: "development",
      NATS_URL: "nats://n:4222",
      NATS_NKEY_SEED_FILE: "/s",
    },
    readFile: (p) => {
      if (p === "/s") return Buffer.from(SEED);
      if (p === "/p") return Buffer.from(PASSWORD);
      throw new Error("ENOENT");
    },
    log: (line) => logs.push(line),
    onShutdown: (fn) => shutdown.push(fn),
    ...over,
  };
  return { d, f, logs, shutdown, connect };
}

afterEach(() => __resetNatsForTests());

describe("the NATS connection", () => {
  it("connects once per app, with the fixed options and an authenticator", async () => {
    const { d, connect } = deps();
    const a = createNatsRequester("clinical", d);
    const b = createNatsRequester("clinical", d);
    expect(a).toBe(b);
    createNatsRequester("platform", d);
    await tick();
    expect(connect).toHaveBeenCalledTimes(2);
    const opts = connect.mock.calls[0]![0];
    expect(opts).toMatchObject({
      servers: "nats://n:4222",
      inboxPrefix: "_INBOX_bff.clinical",
      name: "mhai-web-clinical",
      maxReconnectAttempts: -1,
      waitOnFirstConnect: true,
      reconnectTimeWait: 2000,
      pingInterval: 20_000,
      maxPingOut: 2,
    });
    expect(typeof opts.authenticator).toBe("function");
    expect(JSON.stringify(opts)).not.toContain(SEED);
    expect(opts).not.toHaveProperty("user");
    expect(opts).not.toHaveProperty("pass");
    expect(opts).not.toHaveProperty("token");
    expect(connect.mock.calls[1]![0]).toMatchObject({
      inboxPrefix: "_INBOX_bff.platform",
    });
  });

  it("ready() follows the connection's status", async () => {
    const { d, f, logs } = deps();
    const r = createNatsRequester("clinical", d);
    expect(r.ready()).toBe(false);
    await tick();
    expect(r.ready()).toBe(true);
    f.emit({ type: "disconnect", server: "x" } as Status);
    await tick();
    expect(r.ready()).toBe(false);
    f.emit({ type: "reconnecting" } as Status);
    await tick();
    expect(r.ready()).toBe(false);
    f.emit({ type: "reconnect", server: "x" } as Status);
    await tick();
    expect(r.ready()).toBe(true);
    f.close();
    await tick();
    expect(r.ready()).toBe(false);
    expect(logs.join("\n")).toMatch(/nats: connected/);
    expect(logs.join("\n")).toMatch(/nats: disconnected/);
    expect(logs.join("\n")).toMatch(/nats: reconnecting/);
    expect(logs.join("\n")).toMatch(/nats: closed/);
  });

  it("a request while not ready rejects at once, without calling nats.js", async () => {
    const { d, f } = deps({
      connect: (() =>
        new Promise(() => {})) as unknown as ConnectDeps["connect"],
    });
    const r = createNatsRequester("clinical", d);
    await expect(
      r.request("api.v1.clinical", new Uint8Array(), {
        headers: [],
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(BackendUnavailable);
    expect(f.nc.request).not.toHaveBeenCalled();
  });

  it("sends the headers and timeout, and returns the reply", async () => {
    const { d, f } = deps();
    const r = createNatsRequester("clinical", d);
    await tick();
    const data = new Uint8Array([1]);
    f.nc.request.mockResolvedValueOnce({ headers: undefined, data });
    const out = await r.request("api.v1.clinical", new Uint8Array([7]), {
      headers: [
        ["Mhai-Method", "GET"],
        ["Authorization", "Bearer t"],
      ],
      timeoutMs: 1234,
    });
    expect(out.data).toBe(data);
    const [subject, payload, opts] = f.nc.request.mock.calls[0] as unknown as [
      string,
      Uint8Array,
      { timeout: number; headers: { get(k: string): string } },
    ];
    expect(subject).toBe("api.v1.clinical");
    expect([...payload]).toEqual([7]);
    expect(opts.timeout).toBe(1234);
    expect(opts.headers.get("Mhai-Method")).toBe("GET");
    expect(opts.headers.get("Authorization")).toBe("Bearer t");
  });

  it("every nats.js error becomes BackendUnavailable with its class name only", async () => {
    const { d, f } = deps();
    const r = createNatsRequester("clinical", d);
    await tick();
    const e = new Error(`no responders: '${PATH}'`);
    e.name = "NoResponders";
    f.nc.request.mockRejectedValueOnce(e);
    const got = await r
      .request("api.v1.clinical", new Uint8Array(), {
        headers: [],
        timeoutMs: 1000,
      })
      .catch((x: unknown) => x);
    expect(got).toBeInstanceOf(BackendUnavailable);
    expect(String(got)).toContain("NoResponders");
    expect(String(got)).not.toContain("SECRET");
  });

  it("an abort signal rejects the wait", async () => {
    const { d, f } = deps();
    const r = createNatsRequester("clinical", d);
    await tick();
    f.nc.request.mockReturnValueOnce(new Promise(() => {}) as never);
    const ac = new AbortController();
    const p = r.request("api.v1.clinical", new Uint8Array(), {
      headers: [],
      timeoutMs: 60_000,
      signal: ac.signal,
    });
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(BackendUnavailable);
  });

  it("a refused config rejects every request and logs once", async () => {
    const { d, logs, connect } = deps({
      env: { MHAI_DEPLOY_ENV: "development", NATS_URL: "nats://n:4222" },
    });
    const r = createNatsRequester("clinical", d);
    for (let i = 0; i < 3; i++)
      await expect(
        r.request("api.v1.clinical", new Uint8Array(), {
          headers: [],
          timeoutMs: 1000,
        }),
      ).rejects.toBeInstanceOf(BackendUnavailable);
    expect(connect).not.toHaveBeenCalled();
    expect(r.ready()).toBe(false);
    expect(logs.filter((l) => l.includes("config refused"))).toHaveLength(1);
    expect(logs.join("\n")).toMatch(
      /nats: config refused \(NATS_NKEY_SEED_FILE/,
    );
  });

  it("A3: no seed, password, token, body or path in any log line", async () => {
    for (const env of [
      {
        MHAI_DEPLOY_ENV: "development",
        NATS_URL: "nats://n:4222",
        NATS_NKEY_SEED_FILE: "/s",
      },
      {
        MHAI_DEPLOY_ENV: "development",
        NATS_URL: "nats://n:4222",
        NATS_USER: "bff_clinical",
        NATS_PASSWORD_FILE: "/p",
      },
    ]) {
      __resetNatsForTests();
      const { d, f, logs } = deps({ env });
      const r = createNatsRequester("clinical", d);
      await tick();
      const e = new Error(`timeout ${PATH} ${TOKEN} ${BODY}`);
      e.name = "TimeoutError";
      f.nc.request.mockRejectedValueOnce(e);
      await r
        .request("api.v1.clinical", new TextEncoder().encode(BODY), {
          headers: [
            ["Mhai-Path", PATH],
            ["Authorization", TOKEN],
          ],
          timeoutMs: 1000,
        })
        .catch(() => {});
      f.emit({ type: "disconnect", server: "nats://u:p@n:4222" } as Status);
      f.emit({ type: "error", error: new Error(PASSWORD) } as Status);
      await tick();
      const all = logs.join("\n");
      expect(all).not.toContain(SEED);
      expect(all).not.toContain(PASSWORD);
      expect(all).not.toContain("SECRET");
      expect(all).not.toContain("u:p@");
    }
  });

  it("SIGTERM drains once", async () => {
    const { d, f, shutdown } = deps();
    createNatsRequester("clinical", d);
    await tick();
    expect(shutdown).toHaveLength(1);
    await shutdown[0]!();
    await shutdown[0]!();
    expect(f.nc.drain).toHaveBeenCalledTimes(1);
  });

  it("A7: the reply inbox is under the app's own prefix, literal tokens only", async () => {
    for (const app of ["clinical", "platform"] as const) {
      __resetNatsForTests();
      const { d, connect } = deps();
      createNatsRequester(app, d);
      await tick();
      const prefix = connect.mock.calls[0]![0].inboxPrefix as string;
      // nats.js's muxed request inbox: createInbox(prefix) + "." + token.
      const reply = `${createInbox(prefix)}.${"abc123"}`;
      expect(reply).toMatch(
        new RegExp(`^_INBOX_bff\\.${app}\\.[A-Za-z0-9]+(\\.[A-Za-z0-9]+)*$`),
      );
    }
  });
});
