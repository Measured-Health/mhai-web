// @vitest-environment node
import { headers as natsHeaders } from "@nats-io/nats-core";
import { describe, expect, it } from "vitest";
import {
  MAX_BODY,
  NATS_API_ORIGIN,
  fromNatsReply,
  toNatsRequest,
  type Mapped,
  type NatsRequestSpec,
} from "./mapping";

const URL_Q = `${NATS_API_ORIGIN}/api/v1/queries/q1?x=1`;

function spec(m: Mapped): NatsRequestSpec {
  if (m.kind !== "send") throw new Error("expected a spec");
  return m.spec;
}
const header = (s: NatsRequestSpec, name: string) =>
  s.headers.filter(([k]) => k === name).map(([, v]) => v);
const names = (s: NatsRequestSpec) => s.headers.map(([k]) => k);

describe("toNatsRequest: subject", () => {
  it("is the app's own subject", () => {
    expect(spec(toNatsRequest("clinical", URL_Q, {})).subject).toBe(
      "api.v1.clinical",
    );
    expect(spec(toNatsRequest("platform", URL_Q, {})).subject).toBe(
      "api.v1.platform",
    );
  });
  it("an unknown app throws", () => {
    expect(() =>
      toNatsRequest("admin" as unknown as "clinical", URL_Q, {}),
    ).toThrow();
  });
});

describe("toNatsRequest: method", () => {
  it("is upper-cased, GET by default", () => {
    expect(
      header(spec(toNatsRequest("clinical", URL_Q, {})), "Mhai-Method"),
    ).toEqual(["GET"]);
    expect(
      header(
        spec(toNatsRequest("clinical", URL_Q, { method: "post" })),
        "Mhai-Method",
      ),
    ).toEqual(["POST"]);
  });
  it.each(["HEAD", "PUT", "PATCH", "DELETE"])("%s passes", (m) => {
    expect(
      header(
        spec(toNatsRequest("clinical", URL_Q, { method: m })),
        "Mhai-Method",
      ),
    ).toEqual([m]);
  });
  it.each(["OPTIONS", "TRACE", "get ", "CONNECT", ""])("%j throws", (m) => {
    expect(() => toNatsRequest("clinical", URL_Q, { method: m })).toThrow();
  });
});

describe("toNatsRequest: path", () => {
  it("is pathname and search", () => {
    expect(
      header(spec(toNatsRequest("clinical", URL_Q, {})), "Mhai-Path"),
    ).toEqual(["/api/v1/queries/q1?x=1"]);
  });
  it.each([
    "http://api.test/api/v1/queries",
    "https://core.nats.invalid/api/v1/queries",
    "http://core.nats.invalid:80/api/v1/queries",
    "http://core.nats.invalid@evil.test/api/v1/queries",
    `${NATS_API_ORIGIN}/api/v2/queries`,
    `${NATS_API_ORIGIN}/api/v1`,
    `${NATS_API_ORIGIN}/api/v1?x=1`,
    `${NATS_API_ORIGIN}/api/v1/queries#frag`,
    `${NATS_API_ORIGIN}/api/v1/quéries`,
    `${NATS_API_ORIGIN}/api/v1/a b`,
    `${NATS_API_ORIGIN}/api/v1/a\tb`,
    `${NATS_API_ORIGIN}/api/v1/${"a".repeat(2048)}`,
  ])("%s throws", (url) => {
    expect(() => toNatsRequest("clinical", url, {})).toThrow();
  });
  it("a path of exactly 2048 bytes passes", () => {
    const p = `/api/v1/${"a".repeat(2048 - "/api/v1/".length)}`;
    expect(
      header(
        spec(toNatsRequest("clinical", NATS_API_ORIGIN + p, {})),
        "Mhai-Path",
      ),
    ).toEqual([p]);
  });
});

describe("toNatsRequest: headers (A5)", () => {
  it("passes only the six, in their own spelling, matched in any case", () => {
    const s = spec(
      toNatsRequest("clinical", URL_Q, {
        method: "POST",
        headers: {
          authorization: "Bearer t",
          "content-type": "application/json",
          "IDEMPOTENCY-KEY": "k-1",
          "if-none-match": '"v1"',
          "x-mhai-client-ip": "198.51.100.7",
          TraceParent:
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
          Accept: "application/json",
          "X-MHAI-Audience": "platform",
          "X-MHAI-Service": "svc-key",
          "X-Request-ID": "forged",
          "Mhai-Request-Id": "forged",
          "Mhai-Method": "DELETE",
          "mhai-path": "/api/v1/admin",
          "Mhai-Status-Code": "200",
          tracestate: "a=b",
          baggage: "a=b",
          Cookie: "s=1",
          "X-MHAI-Background": "1",
        },
        body: "{}",
      }),
    );
    expect(names(s).sort()).toEqual(
      [
        "Mhai-Method",
        "Mhai-Path",
        "Mhai-Timeout-Ms",
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "If-None-Match",
        "X-MHAI-Client-IP",
        "traceparent",
      ].sort(),
    );
    expect(header(s, "Mhai-Method")).toEqual(["POST"]);
    expect(header(s, "Mhai-Path")).toEqual(["/api/v1/queries/q1?x=1"]);
    expect(header(s, "Authorization")).toEqual(["Bearer t"]);
  });
  it("reads a Headers object and an array of pairs", () => {
    const h = new Headers({ Authorization: "Bearer t", Accept: "x" });
    expect(
      header(
        spec(toNatsRequest("clinical", URL_Q, { headers: h })),
        "Authorization",
      ),
    ).toEqual(["Bearer t"]);
    expect(
      header(
        spec(
          toNatsRequest("clinical", URL_Q, {
            headers: [["Idempotency-Key", "k-2"]],
          }),
        ),
        "Idempotency-Key",
      ),
    ).toEqual(["k-2"]);
  });
  it.each(["a\rb", "a\nb", "a\0b", "café", "a\u007fb", "", "x".repeat(4097)])(
    "a value %j throws",
    (v) => {
      expect(() =>
        toNatsRequest("clinical", URL_Q, { headers: { Authorization: v } }),
      ).toThrow();
    },
  );
  it("a header given twice throws", () => {
    expect(() =>
      toNatsRequest("clinical", URL_Q, {
        headers: [
          ["Authorization", "Bearer a"],
          ["authorization", "Bearer b"],
        ],
      }),
    ).toThrow();
    const h = new Headers();
    h.append("Authorization", "Bearer a");
    h.append("Authorization", "Bearer b");
    expect(() => toNatsRequest("clinical", URL_Q, { headers: h })).toThrow();
    const k = new Headers();
    k.append("Idempotency-Key", "a");
    k.append("Idempotency-Key", "b");
    expect(() => toNatsRequest("clinical", URL_Q, { headers: k })).toThrow();
  });
  it("an error never carries a header's value", () => {
    let caught: unknown;
    try {
      toNatsRequest("clinical", URL_Q, {
        headers: { Authorization: "Bearer secret-token\r\n" },
      });
    } catch (e) {
      caught = e;
    }
    expect(String(caught)).not.toContain("secret-token");
  });
});

describe("toNatsRequest: timeout (R5)", () => {
  it.each([
    [30_000, "29500", 30_000],
    [15_000, "14500", 15_000],
    [1200, "1000", 1200],
    [undefined, "14500", 15_000],
  ])("%s ms → %s", (t, header_, total) => {
    const s = spec(toNatsRequest("clinical", URL_Q, { timeoutMs: t }));
    expect(header(s, "Mhai-Timeout-Ms")).toEqual([header_]);
    expect(s.timeoutMs).toBe(total);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("%s throws", (t) => {
    expect(() => toNatsRequest("clinical", URL_Q, { timeoutMs: t })).toThrow();
  });
});

describe("toNatsRequest: body (R6)", () => {
  it("a string is UTF-8 bytes", () => {
    const s = spec(
      toNatsRequest("clinical", URL_Q, { method: "POST", body: "é" }),
    );
    expect([...s.data]).toEqual([0xc3, 0xa9]);
  });
  it("bytes pass as they are", () => {
    const b = new Uint8Array([0, 1, 2, 255]);
    expect([
      ...spec(toNatsRequest("clinical", URL_Q, { method: "POST", body: b }))
        .data,
    ]).toEqual([0, 1, 2, 255]);
  });
  it("no body is empty", () => {
    expect(spec(toNatsRequest("clinical", URL_Q, {})).data.byteLength).toBe(0);
  });
  it("64 KB sends", () => {
    const s = spec(
      toNatsRequest("clinical", URL_Q, {
        method: "POST",
        body: new Uint8Array(MAX_BODY),
      }),
    );
    expect(s.data.byteLength).toBe(MAX_BODY);
  });
  it("64 KB + 1 answers 413 locally, as core would (clinical)", async () => {
    const m = toNatsRequest("clinical", URL_Q, {
      method: "POST",
      body: "x".repeat(MAX_BODY + 1),
    });
    expect(m.kind).toBe("answer");
    if (m.kind !== "answer") return;
    expect(m.response.status).toBe(413);
    expect(m.response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
    expect((await m.response.json()).code).toBe("payload_too_large");
  });
  it("64 KB + 1 answers {code} only on platform", async () => {
    const m = toNatsRequest("platform", URL_Q, {
      method: "POST",
      body: new Uint8Array(MAX_BODY + 1),
    });
    if (m.kind !== "answer") throw new Error("expected an answer");
    expect(m.response.status).toBe(413);
    expect(m.response.headers.get("Content-Type")).toBe("application/json");
    expect(await m.response.json()).toEqual({ code: "payload_too_large" });
  });
  it("FormData and streams throw", () => {
    expect(() =>
      toNatsRequest("clinical", URL_Q, {
        method: "POST",
        body: new FormData(),
      }),
    ).toThrow();
    expect(() =>
      toNatsRequest("clinical", URL_Q, {
        method: "POST",
        body: new ReadableStream(),
      }),
    ).toThrow();
  });
});

function reply(h: [string, string][], data = new Uint8Array()) {
  const headers = natsHeaders();
  for (const [k, v] of h) headers.append(k, v);
  return { headers, data };
}

describe("fromNatsReply", () => {
  it("takes the status from Mhai-Status-Code", async () => {
    const r = fromNatsReply(
      "clinical",
      "POST",
      reply(
        [
          ["Mhai-Status-Code", "201"],
          ["Content-Type", "application/json"],
        ],
        new TextEncoder().encode('{"a":1}'),
      ),
    );
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ a: 1 });
  });
  it.each([
    [[]],
    [
      [
        ["Mhai-Status-Code", "200"],
        ["Mhai-Status-Code", "201"],
      ],
    ],
    [[["Mhai-Status-Code", "abc"]]],
    [[["Mhai-Status-Code", "99"]]],
    [[["Mhai-Status-Code", "199"]]],
    [[["Mhai-Status-Code", "600"]]],
    [[["Mhai-Status-Code", "2000"]]],
  ] as [string, string][][][])("a bad status %j throws", (h) => {
    expect(() => fromNatsReply("clinical", "GET", reply(h))).toThrow();
  });
  it("no headers at all throws", () => {
    expect(() =>
      fromNatsReply("clinical", "GET", { data: new Uint8Array() }),
    ).toThrow();
  });
  it("a NATS status reply (no responders) throws", () => {
    const headers = natsHeaders(503, "No Responders");
    expect(() =>
      fromNatsReply("clinical", "GET", { headers, data: new Uint8Array() }),
    ).toThrow();
  });
  it("keeps only the ten reply headers", () => {
    const r = fromNatsReply(
      "platform",
      "GET",
      reply([
        ["Mhai-Status-Code", "200"],
        ["Content-Type", "application/json"],
        ["Cache-Control", "no-store"],
        ["ETag", '"v1"'],
        ["Retry-After", "5"],
        ["X-Request-ID", "req-1"],
        ["Idempotent-Replayed", "true"],
        ["Deprecation", "true"],
        ["Sunset", "Wed, 01 Jan 2031 00:00:00 GMT"],
        ["Link", "</x>; rel=successor-version"],
        ["X-Content-Type-Options", "nosniff"],
        ["Set-Cookie", "a=1"],
        ["Mhai-Status", "x"],
        ["Location", "http://evil.test/"],
      ]),
    );
    expect([...r.headers.keys()].sort()).toEqual(
      [
        "cache-control",
        "content-type",
        "deprecation",
        "etag",
        "idempotent-replayed",
        "link",
        "retry-after",
        "sunset",
        "x-content-type-options",
        "x-request-id",
      ].sort(),
    );
  });
  it.each([
    ["HEAD", "200"],
    ["GET", "204"],
    ["GET", "304"],
  ])("%s %s has no body", (method, status) => {
    const r = fromNatsReply(
      "clinical",
      method,
      reply([["Mhai-Status-Code", status]], new Uint8Array([1, 2])),
    );
    expect(r.body).toBeNull();
  });
  it("passes the body bytes unchanged (a PNG)", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255,
    ]);
    const r = fromNatsReply(
      "clinical",
      "GET",
      reply(
        [
          ["Mhai-Status-Code", "200"],
          ["Content-Type", "image/png"],
        ],
        png,
      ),
    );
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(png);
    expect(r.headers.get("Content-Type")).toBe("image/png");
  });
});
