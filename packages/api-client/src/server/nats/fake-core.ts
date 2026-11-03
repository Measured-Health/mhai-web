import "server-only";
import { headers as natsHeaders } from "@nats-io/nats-core";
import type { NatsRequester } from "./connection";
import {
  MAX_BODY,
  MAX_PATH,
  METHOD_HEADER,
  PATH_HEADER,
  REPLY_HEADERS,
  REQUEST_HEADERS,
  STATUS_HEADER,
  TIMEOUT_HEADER,
  type BackendApp,
} from "./mapping";

/**
 * Test helper: core's NATS adapter (natsapi) in memory, in front of the
 * suites' stubbed `fetch`. It applies the adapter's rules to what the
 * transport sends, then calls `globalThis.fetch` (looked up per call, so
 * `vi.stubGlobal` works) as core's HTTP chain would see the request, with
 * the audience core derives from the subject. The Response goes back as a
 * reply with Mhai-Status-Code and the ten reply headers only.
 *
 * A broken rule answers as core does (405, 404, 413). A publish on another
 * app's subject is a permissions violation (thrown, as nats.js does); a
 * fetch that throws or hangs past the timeout is no reply (thrown).
 *
 * Never imported by app code: only the apps' test setup files use it.
 */

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const CODES = {
  404: "not_found",
  405: "method_not_allowed",
  413: "payload_too_large",
} as const;

function single(h: [string, string][], name: string): string | undefined {
  const v = h.filter(([k]) => k.toLowerCase() === name.toLowerCase());
  return v.length === 1 ? v[0]![1] : undefined;
}

function problem(app: BackendApp, status: keyof typeof CODES) {
  const code = CODES[status];
  const h = natsHeaders();
  h.set(STATUS_HEADER, String(status));
  h.set(
    "Content-Type",
    app === "platform" ? "application/json" : "application/problem+json",
  );
  h.set("Cache-Control", "no-store");
  const body = app === "platform" ? { code } : { code, status };
  return { headers: h, data: new TextEncoder().encode(JSON.stringify(body)) };
}

const JSONISH = /^application\/([a-z+.-]*\+)?json\b/i;

export function fakeCore(app: BackendApp): NatsRequester {
  return {
    ready: () => true,
    async request(subject, data, { headers, timeoutMs, signal }) {
      if (subject !== `api.v1.${app}`) {
        const e = new Error("permissions violation");
        e.name = "PermissionViolationError";
        throw e;
      }
      const method = single(headers, METHOD_HEADER);
      if (!method || !METHODS.has(method)) return problem(app, 405);
      const path = single(headers, PATH_HEADER);
      if (
        !path ||
        path.length > MAX_PATH ||
        !path.startsWith("/api/v1/") ||
        path.includes("#")
      )
        return problem(app, 404);
      if (data.byteLength > MAX_BODY) return problem(app, 413);
      const t = Number(single(headers, TIMEOUT_HEADER));
      const coreTimeout =
        Number.isInteger(t) && t > 0 && t < 30_000 ? t : 30_000;

      const allowed = new Map(REQUEST_HEADERS.map((n) => [n.toLowerCase(), n]));
      const out: Record<string, string> = {};
      for (const [k, v] of headers) {
        const name = allowed.get(k.toLowerCase());
        if (name) out[name] = v;
      }
      out["X-MHAI-Audience"] = app;

      const type = out["Content-Type"] ?? "";
      const body =
        data.byteLength === 0
          ? undefined
          : JSONISH.test(type)
            ? new TextDecoder().decode(data)
            : data;

      const base = (process.env.MHAI_API_URL ?? "http://api.test").replace(
        /\/+$/,
        "",
      );
      const signals = [AbortSignal.timeout(Math.min(timeoutMs, coreTimeout))];
      if (signal) signals.push(signal);
      let res: Response;
      try {
        res = await globalThis.fetch(`${base}${path}`, {
          method,
          headers: out,
          body: body as BodyInit | undefined,
          signal: AbortSignal.any(signals),
        });
      } catch {
        const e = new Error("timeout");
        e.name = "TimeoutError";
        throw e;
      }
      const h = natsHeaders();
      h.set(STATUS_HEADER, String(res.status));
      for (const name of REPLY_HEADERS) {
        const v = res.headers.get(name);
        if (v !== null) h.set(name, v);
      }
      const bytes =
        method === "HEAD"
          ? new Uint8Array()
          : new Uint8Array(await res.arrayBuffer());
      return { headers: h, data: bytes };
    },
  };
}
