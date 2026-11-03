// @vitest-environment node
import { headers as natsHeaders } from "@nats-io/nats-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NATS_API_ORIGIN,
  backendReady,
  createBackendFetch,
  type BackendApp,
} from "./backend-fetch";
import { BackendUnavailable, type NatsRequester } from "./nats/connection";
import { fakeCore } from "./nats/fake-core";

const SERVICE_KEY = "svc-SECRET-key-123";
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function reply(status: string, body = "{}", extra: [string, string][] = []) {
  const h = natsHeaders();
  h.set("Mhai-Status-Code", status);
  h.set("Content-Type", "application/json");
  for (const [k, v] of extra) h.set(k, v);
  return { headers: h, data: new TextEncoder().encode(body) };
}

function recorder(answer: () => Promise<ReturnType<typeof reply>>) {
  const calls: {
    subject: string;
    data: Uint8Array;
    headers: [string, string][];
    timeoutMs: number;
  }[] = [];
  const r: NatsRequester & { calls: typeof calls; up: boolean } = {
    calls,
    up: true,
    ready: () => r.up,
    async request(subject, data, opts) {
      calls.push({
        subject,
        data,
        headers: opts.headers,
        timeoutMs: opts.timeoutMs,
      });
      return answer();
    },
  };
  return r;
}

const ipOf = (v: string | undefined) => async () => v;
const files = (map: Record<string, string>) => (p: string) => {
  if (!(p in map)) throw new Error("ENOENT");
  return Buffer.from(map[p]!);
};

describe("BACKEND_TRANSPORT=http (default)", () => {
  it("is fetch with the caller's request, no-store, the client IP and the service key", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: 1 }));
    const logs: string[] = [];
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf("198.51.100.7"),
      env: { BFF_SERVICE_KEY_FILE: "/k" },
      readFile: files({ "/k": `${SERVICE_KEY}\n` }),
      log: (l) => logs.push(l),
    });
    const res = await f("http://api.test/api/v1/auth/login", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: '{"a":1}',
      timeoutMs: 15_000,
    });
    expect(await res.json()).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.cache).toBe("no-store");
    expect(init).not.toHaveProperty("timeoutMs");
    expect(init.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-MHAI-Client-IP": "198.51.100.7",
      "X-MHAI-Service": SERVICE_KEY,
    });
    expect(logs.join("\n")).not.toContain("SECRET");
  });

  it("A6: no client IP or key when absent or invalid; the caller's headers unchanged", async () => {
    for (const [ip, env, readFile] of [
      [undefined, {}, files({})],
      ["not-an-ip", { BFF_SERVICE_KEY_FILE: "/missing" }, files({})],
      [
        "198.51.100.7, 10.0.0.1",
        { BFF_SERVICE_KEY_FILE: "/k" },
        files({ "/k": "bad\nkey" }),
      ],
    ] as const) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(Response.json({}));
      const headers = { Authorization: "Bearer t" };
      const f = createBackendFetch({
        app: "clinical",
        clientIp: ipOf(ip),
        env: { ...env },
        readFile,
        log: () => {},
      });
      await f("http://api.test/api/v1/x", { headers });
      expect(
        (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
      ).toBe(headers);
    }
  });

  it("a caller can't set the client IP or the key itself", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const f = createBackendFetch({
      app: "platform",
      clientIp: ipOf("203.0.113.9"),
      env: {},
      log: () => {},
    });
    await f("http://api.test/api/v1/x", {
      headers: new Headers({
        "x-mhai-client-ip": "10.0.0.1",
        "X-MHAI-Audience": "platform",
      }),
    });
    const h = new Headers(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    );
    expect(h.get("X-MHAI-Client-IP")).toBe("203.0.113.9");
    expect(h.get("X-MHAI-Audience")).toBe("platform");
  });

  it("a thrown fetch rejects (the callers answer 503)", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env: {},
    });
    await expect(f("http://api.test/api/v1/x")).rejects.toThrow();
  });
});

describe("BACKEND_TRANSPORT=nats", () => {
  const env = { BACKEND_TRANSPORT: "nats", BFF_SERVICE_KEY_FILE: "/k" };

  it.each(["clinical", "platform"] as BackendApp[])(
    "A8: %s publishes only its own subject, whatever the caller sends",
    async (app) => {
      const r = recorder(async () => reply("200"));
      const f = createBackendFetch({
        app,
        clientIp: ipOf(undefined),
        env,
        requester: r,
      });
      await f(`${NATS_API_ORIGIN}/api/v1/platform/x`, {
        headers: {
          "X-MHAI-Audience": app === "clinical" ? "platform" : "clinical",
        },
      });
      expect(r.calls.map((c) => c.subject)).toEqual([`api.v1.${app}`]);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("another origin throws before any request", async () => {
    const r = recorder(async () => reply("200"));
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env,
      requester: r,
    });
    await expect(f("http://api.test/api/v1/x")).rejects.toBeInstanceOf(
      BackendUnavailable,
    );
    expect(r.calls).toHaveLength(0);
  });

  it("the client IP rides as X-MHAI-Client-IP; the service key is never read or sent", async () => {
    const r = recorder(async () =>
      reply("201", '{"id":"q1"}', [["X-Request-ID", "req-1"]]),
    );
    const readFile = vi.fn(files({ "/k": SERVICE_KEY }));
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf("198.51.100.7"),
      env,
      requester: r,
      readFile,
    });
    const res = await f(`${NATS_API_ORIGIN}/api/v1/queries`, {
      method: "POST",
      headers: {
        Authorization: "Bearer t",
        "Content-Type": "application/json",
      },
      body: "{}",
      timeoutMs: 30_000,
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "q1" });
    expect(res.headers.get("X-Request-ID")).toBe("req-1");
    const sent = r.calls[0]!;
    expect(sent.headers).toContainEqual(["X-MHAI-Client-IP", "198.51.100.7"]);
    expect(sent.headers.map(([k]) => k.toLowerCase())).not.toContain(
      "x-mhai-service",
    );
    expect(sent.timeoutMs).toBe(30_000);
    expect(sent.headers).toContainEqual(["Mhai-Timeout-Ms", "29500"]);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("a body over 64 KB is answered 413 locally and never published", async () => {
    const r = recorder(async () => reply("200"));
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env,
      requester: r,
    });
    const res = await f(`${NATS_API_ORIGIN}/api/v1/queries`, {
      method: "POST",
      body: "x".repeat(64 * 1024 + 1),
    });
    expect(res.status).toBe(413);
    expect(r.calls).toHaveLength(0);
  });

  it.each([
    ["no responders", "NoResponders"],
    ["a timeout", "TimeoutError"],
    ["a closed connection", "ClosedConnectionError"],
  ])("A11: %s rejects", async (_label, name) => {
    const logs: string[] = [];
    const r = recorder(async () => {
      throw new BackendUnavailable(name);
    });
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env,
      requester: r,
      log: (l) => logs.push(l),
    });
    await expect(
      f(`${NATS_API_ORIGIN}/api/v1/queries/q1?mrn=SECRET`),
    ).rejects.toBeInstanceOf(BackendUnavailable);
    // A9: the failure is logged without the path or query.
    expect(logs.join("\n")).toContain("backend: unavailable");
    expect(logs.join("\n")).not.toContain("SECRET");
    expect(logs.join("\n")).not.toContain("queries");
  });

  it.each([
    [[]],
    [[["Mhai-Status-Code", "abc"]]],
    [
      [
        ["Mhai-Status-Code", "200"],
        ["Mhai-Status-Code", "201"],
      ],
    ],
  ] as [[string, string][]][])(
    "A11: a reply with status headers %j rejects",
    async (hs) => {
      const r = recorder(async () => {
        const h = natsHeaders();
        for (const [k, v] of hs) h.append(k, v);
        return { headers: h, data: new Uint8Array() };
      });
      const f = createBackendFetch({
        app: "clinical",
        clientIp: ipOf(undefined),
        env,
        requester: r,
        log: () => {},
      });
      await expect(
        f(`${NATS_API_ORIGIN}/api/v1/queries/q1`),
      ).rejects.toBeInstanceOf(BackendUnavailable);
    },
  );

  it("an abort signal that fires rejects", async () => {
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env,
      requester: fakeCore("clinical"),
      log: () => {},
    });
    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          ),
        ),
    );
    await expect(
      f(`${NATS_API_ORIGIN}/api/v1/queries/q1`, {
        signal: AbortSignal.timeout(10),
      }),
    ).rejects.toBeInstanceOf(BackendUnavailable);
  });

  it("A14: a write's Idempotency-Key reaches core unchanged on every retry", async () => {
    vi.stubEnv("MHAI_API_URL", "http://api.test");
    fetchMock.mockImplementation(async () =>
      Response.json({}, { status: 202 }),
    );
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env,
      requester: fakeCore("clinical"),
    });
    for (let i = 0; i < 2; i++)
      await f(`${NATS_API_ORIGIN}/api/v1/queries`, {
        method: "POST",
        headers: {
          "Idempotency-Key": "k-1",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    for (const [url, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(url).toBe("http://api.test/api/v1/queries");
      expect(init.headers).toMatchObject({ "Idempotency-Key": "k-1" });
    }
  });
});

describe("an unknown BACKEND_TRANSPORT", () => {
  it("refuses every call and logs once", async () => {
    const logs: string[] = [];
    const f = createBackendFetch({
      app: "clinical",
      clientIp: ipOf(undefined),
      env: { BACKEND_TRANSPORT: "grpc" },
      log: (l) => logs.push(l),
    });
    for (let i = 0; i < 3; i++)
      await expect(f("http://api.test/api/v1/x")).rejects.toBeInstanceOf(
        BackendUnavailable,
      );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.filter((l) => l.includes("transport refused"))).toHaveLength(1);
  });
});

describe("backendReady", () => {
  it("http is always ready", () => {
    expect(backendReady("clinical", { env: {} })).toBe(true);
    expect(
      backendReady("clinical", { env: { BACKEND_TRANSPORT: "http" } }),
    ).toBe(true);
  });
  it("nats follows the requester", () => {
    const r = recorder(async () => reply("200"));
    const env = { BACKEND_TRANSPORT: "nats" };
    expect(backendReady("clinical", { env, requester: r })).toBe(true);
    r.up = false;
    expect(backendReady("clinical", { env, requester: r })).toBe(false);
  });
  it("an unknown transport is never ready", () => {
    expect(
      backendReady("clinical", { env: { BACKEND_TRANSPORT: "grpc" } }),
    ).toBe(false);
  });
});
