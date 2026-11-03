// @vitest-environment node
/**
 * The BFF transport against a real NATS and core: the backend's smoke stack
 * (scripts/it/backend-stack.sh), on the build server only. Skipped unless
 * MHAI_IT_NATS_URL is set; `npm run test:it -w @mhai/api-client`.
 *
 *   MHAI_IT_NATS_URL      nats://nats:4222 (on the stack's network)
 *   MHAI_IT_CORE_URL      http://core:8080
 *   MHAI_IT_STATE         the stack's state folder (BFF password files, service key)
 *   MHAI_IT_USER_FILE     a fresh synthetic clinician ({email, password})
 *   MHAI_IT_CORE_CONTAINER  core's container, for A13 (needs the docker CLI)
 *
 * Synthetic data only.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect as natsConnect } from "@nats-io/transport-node";
import {
  headers as natsHeaders,
  usernamePasswordAuthenticator,
} from "@nats-io/nats-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBackendFetch, type BackendFetch } from "../backend-fetch";
import { formatLog } from "../log";
import {
  BackendUnavailable,
  openNatsRequester,
  type NatsRequester,
} from "./connection";
import { fromNatsReply, type BackendApp } from "./mapping";

const NATS_URL = process.env.MHAI_IT_NATS_URL;
const CORE_URL = process.env.MHAI_IT_CORE_URL ?? "http://core:8080";
const STATE = process.env.MHAI_IT_STATE ?? "/state";
const USER_FILE =
  process.env.MHAI_IT_USER_FILE ?? `${STATE}/users/clinician-it.json`;
const CORE_CONTAINER = process.env.MHAI_IT_CORE_CONTAINER;
const NATS_ORIGIN = "http://core.nats.invalid";
const CLIENT_IP = "198.51.100.15"; // TEST-NET-2

const QUESTION = {
  patient_data: {
    age: 54,
    sex: "female",
    symptoms: ["synthetic chest pain", "synthetic shortness of breath"],
  },
  clinical_question:
    "Synthetic integration-test question: what should be ruled out first?",
  urgency: "routine",
};

const logs: string[] = [];

function requester(app: BackendApp, user: string): NatsRequester {
  return openNatsRequester(app, {
    connect: natsConnect,
    env: {
      MHAI_DEPLOY_ENV: "development",
      NATS_URL,
      NATS_USER: user,
      NATS_PASSWORD_FILE: `${STATE}/${user}.pass`,
    },
    readFile: (p) => readFileSync(p),
    log: (l) => logs.push(l),
    onShutdown: () => {},
  });
}

type Answer = {
  status: number;
  headers: Headers;
  body: Record<string, unknown> | null;
};

async function call(
  f: BackendFetch,
  base: string,
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: unknown;
    key?: string;
    extra?: Record<string, string>;
  } = {},
): Promise<Answer> {
  const res = await f(`${base}/api/v1${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      ...(opts.key && { "Idempotency-Key": opts.key }),
      ...opts.extra,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(20_000),
    timeoutMs: 20_000,
  });
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status: res.status, headers: res.headers, body };
}

async function until<T>(
  f: () => Promise<T | undefined>,
  ms: number,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await f().catch(() => undefined);
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 500));
  }
}

const withoutVolatile = (b: Record<string, unknown> | null) => {
  if (!b) return b;
  const { request_id: _r, ...rest } = b;
  void _r;
  return rest;
};

describe.runIf(Boolean(NATS_URL))("the BFF transport against core", () => {
  let clinical: NatsRequester;
  let viaNats: BackendFetch;
  let viaHttp: BackendFetch;
  let token = "";
  let queryId = "";
  const key = `it-${Date.now().toString(36)}`;

  beforeAll(async () => {
    clinical = requester("clinical", "bff_clinical");
    await until(async () => (clinical.ready() ? true : undefined), 15_000);
    viaNats = createBackendFetch({
      app: "clinical",
      clientIp: async () => CLIENT_IP,
      env: { BACKEND_TRANSPORT: "nats" },
      requester: clinical,
      log: (l) => logs.push(l),
    });
    viaHttp = createBackendFetch({
      app: "clinical",
      clientIp: async () => CLIENT_IP,
      env: {
        BACKEND_TRANSPORT: "http",
        BFF_SERVICE_KEY_FILE: `${STATE}/service.key`,
      },
      log: (l) => logs.push(l),
    });
  });
  afterAll(async () => {
    await clinical?.close?.();
  });

  it("sign in, ask, and read the result over NATS as bff_clinical", async () => {
    const user = JSON.parse(readFileSync(USER_FILE, "utf8")) as {
      email: string;
      password: string;
    };
    const login = await call(viaNats, NATS_ORIGIN, "POST", "/auth/login", {
      body: { username: user.email, password: user.password },
    });
    expect(login.status).toBe(200);
    token = String(login.body?.access_token ?? "");
    expect(token).not.toBe("");
    const u = login.body?.user as Record<string, unknown>;
    if (u?.must_change_password) {
      const pw = await call(viaNats, NATS_ORIGIN, "POST", "/auth/password", {
        token,
        body: {
          current_password: user.password,
          new_password: `${user.password}-2`,
        },
      });
      expect(pw.status).toBe(204);
    }
    const terms = await call(viaNats, NATS_ORIGIN, "POST", "/auth/terms", {
      token,
      body: { version: "2026-10" },
    });
    expect(terms.status).toBe(204);

    const ask = await call(viaNats, NATS_ORIGIN, "POST", "/queries", {
      token,
      key,
      body: QUESTION,
    });
    expect(ask.status).toBe(202);
    queryId = String(ask.body?.query_id ?? "");
    expect(queryId).not.toBe("");
    expect(["queued", "processing"]).toContain(ask.body?.status);

    const done = await until(async () => {
      const s = await call(viaNats, NATS_ORIGIN, "GET", `/queries/${queryId}`, {
        token,
      });
      expect(s.status).toBe(200);
      expect(["queued", "processing", "completed"]).toContain(s.body?.status);
      return s.body?.status === "completed" ? s : undefined;
    }, 90_000);
    expect(done.body?.status).toBe("completed");

    const result = await call(
      viaNats,
      NATS_ORIGIN,
      "GET",
      `/queries/${queryId}/result`,
      {
        token,
      },
    );
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("trust_band");
    expect(result.body).toHaveProperty("cited_chunk_ids");
    expect(result.headers.get("X-Request-ID")).toBeTruthy();
  }, 150_000);

  it("parity: the same requests answer the same on HTTP and NATS", async () => {
    expect(queryId).not.toBe("");
    const pairs: [string, string][] = [
      ["GET", `/queries/${queryId}/result`],
      ["GET", `/queries/${queryId}`],
      ["GET", "/queries/q-does-not-exist"],
      ["GET", "/queries/q-does-not-exist/result"],
    ];
    for (const [method, path] of pairs) {
      const h = await call(viaHttp, CORE_URL, method, path, { token });
      const n = await call(viaNats, NATS_ORIGIN, method, path, { token });
      expect([path, n.status]).toEqual([path, h.status]);
      expect(withoutVolatile(n.body)).toEqual(withoutVolatile(h.body));
      for (const name of [
        "Content-Type",
        "Cache-Control",
        "X-Content-Type-Options",
      ])
        expect([path, name, n.headers.get(name)]).toEqual([
          path,
          name,
          h.headers.get(name),
        ]);
    }
    // A refused sign-in: same status and code on both.
    const bad = {
      username: "nobody@hit.example.test",
      password: "Not-the-password-1",
    };
    const h = await call(viaHttp, CORE_URL, "POST", "/auth/login", {
      body: bad,
    });
    const n = await call(viaNats, NATS_ORIGIN, "POST", "/auth/login", {
      body: bad,
    });
    expect(n.status).toBe(h.status);
    expect(n.body?.code).toBe(h.body?.code);
  }, 60_000);

  it("A14: a retried write with the same Idempotency-Key is replayed, not repeated", async () => {
    const again = await call(viaNats, NATS_ORIGIN, "POST", "/queries", {
      token,
      key,
      body: QUESTION,
    });
    expect(again.status).toBe(202);
    expect(again.body?.query_id).toBe(queryId);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
  });

  it("If-None-Match passes to core", async () => {
    const r = await call(viaNats, NATS_ORIGIN, "GET", `/queries/${queryId}`, {
      token,
      extra: { "If-None-Match": '"none"' },
    });
    expect(r.status).toBe(200);
  });

  it("413: a body over 64 KB sent past the local check gets core's own refusal", async () => {
    const h: [string, string][] = [
      ["Mhai-Method", "POST"],
      ["Mhai-Path", "/api/v1/queries"],
      ["Content-Type", "application/json"],
      ["Authorization", `Bearer ${token}`],
    ];
    const reply = await clinical.request(
      "api.v1.clinical",
      new Uint8Array(65 * 1024),
      {
        headers: h,
        timeoutMs: 10_000,
      },
    );
    const res = fromNatsReply("clinical", "POST", reply);
    expect(res.status).toBe(413);
    expect(((await res.json()) as { code: string }).code).toBe(
      "payload_too_large",
    );
  });

  it("the subject is the audience: a clinician signing in on the platform subject is refused", async () => {
    const platform = requester("platform", "bff_platform");
    try {
      await until(async () => (platform.ready() ? true : undefined), 15_000);
      const f = createBackendFetch({
        app: "platform",
        clientIp: async () => CLIENT_IP,
        env: { BACKEND_TRANSPORT: "nats" },
        requester: platform,
        log: () => {},
      });
      const user = JSON.parse(readFileSync(USER_FILE, "utf8")) as {
        email: string;
        password: string;
      };
      const r = await call(f, NATS_ORIGIN, "POST", "/auth/login", {
        body: { username: user.email, password: `${user.password}-2` },
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(r.body).not.toHaveProperty("access_token");
    } finally {
      await platform.close?.();
    }
  }, 30_000);

  it("A12: bff_clinical can't publish api.v1.platform: the transport answers unavailable", async () => {
    const f = createBackendFetch({
      app: "platform", // a platform request on the clinical connection
      clientIp: async () => CLIENT_IP,
      env: { BACKEND_TRANSPORT: "nats" },
      requester: clinical,
      log: () => {},
    });
    await expect(
      f(`${NATS_ORIGIN}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        timeoutMs: 3000,
      }),
    ).rejects.toBeInstanceOf(BackendUnavailable);
    // The connection survives the violation.
    const ok = await call(viaNats, NATS_ORIGIN, "GET", `/queries/${queryId}`, {
      token,
    });
    expect(ok.status).toBe(200);
  }, 30_000);

  it("A12: bff_clinical with the platform inbox prefix gets no answer", async () => {
    const nc = await natsConnect({
      servers: NATS_URL,
      authenticator: usernamePasswordAuthenticator(
        "bff_clinical",
        readFileSync(`${STATE}/bff_clinical.pass`, "utf8").trim(),
      ),
      inboxPrefix: "_INBOX_bff.platform",
      maxReconnectAttempts: 0,
    });
    try {
      const h = natsHeaders();
      h.set("Mhai-Method", "GET");
      h.set("Mhai-Path", `/api/v1/queries/${queryId}`);
      h.set("Authorization", `Bearer ${token}`);
      await expect(
        nc.request("api.v1.clinical", new Uint8Array(), {
          headers: h,
          timeout: 3000,
        }),
      ).rejects.toThrow();
    } finally {
      await nc.close();
    }
  }, 30_000);

  it("A3: nothing logged holds a token, password, path or body", () => {
    const all = logs.join("\n");
    expect(all).not.toContain(token);
    expect(all).not.toContain("/api/v1");
    expect(all).not.toContain("synthetic chest pain");
    expect(all).not.toContain(
      readFileSync(`${STATE}/bff_clinical.pass`, "utf8").trim(),
    );
    expect(formatLog("x")).toBe('{"msg":"x"}');
  });

  it.runIf(Boolean(CORE_CONTAINER))(
    "A13: core stopped answers unavailable at once; back, the same connection works",
    async () => {
      execFileSync("docker", ["stop", CORE_CONTAINER!], { stdio: "ignore" });
      try {
        const started = Date.now();
        const e = await call(
          viaNats,
          NATS_ORIGIN,
          "GET",
          `/queries/${queryId}`,
          {
            token,
          },
        ).catch((x: unknown) => x);
        expect(e).toBeInstanceOf(BackendUnavailable);
        expect(Date.now() - started).toBeLessThan(1000);
      } finally {
        execFileSync("docker", ["start", CORE_CONTAINER!], { stdio: "ignore" });
      }
      const back = await until(async () => {
        const r = await call(
          viaNats,
          NATS_ORIGIN,
          "GET",
          `/queries/${queryId}`,
          { token },
        );
        return r.status === 200 ? r : undefined;
      }, 90_000);
      expect(back.status).toBe(200);
    },
    150_000,
  );
});
