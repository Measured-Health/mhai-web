import { reportUnauthorized } from "../auth/events";
import type { MhaiClient } from "./client";
import type { ClinicalResultOut, QueryStatusOut, Readiness } from "./contract";
import { ApiError } from "./errors";

/** The real API, through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): MhaiClient {
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    extra?: Record<string, string>,
  ) {
    let res: Response;
    try {
      res = await fetchImpl(`/api/v1${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.status === 401) {
      reportUnauthorized();
      throw new ApiError(401, "session_expired");
    }
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { res, data };
  }
  async function ok<T>(
    path: string,
    method = "GET",
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<T> {
    const { res, data } = await call(path, method, body, extra);
    if (!res.ok)
      throw new ApiError(
        res.status,
        typeof data?.code === "string" ? data.code : "error",
      );
    return data as T;
  }
  const id = encodeURIComponent;
  const keyHeader = (opts?: { idempotencyKey?: string }) =>
    opts?.idempotencyKey
      ? { "Idempotency-Key": opts.idempotencyKey }
      : undefined;
  return {
    async createQuery(q, opts) {
      const r = await ok<{ query_id: string }>(
        "/queries",
        "POST",
        q,
        keyHeader(opts),
      );
      return { query_id: r.query_id };
    },
    getStatus: (q) => ok<QueryStatusOut>(`/queries/${id(q)}`),
    getResult: (q) => ok<ClinicalResultOut>(`/queries/${id(q)}/result`),
    sendFeedback: (f, opts) => ok("/feedback", "POST", f, keyHeader(opts)),
    async getReadiness(): Promise<Readiness> {
      const { res, data } = await call("/readyz");
      if (res.ok) return { ok: true, degraded_services: [] };
      if (res.status === 503 && data)
        return {
          ok: false,
          degraded_services: Object.entries(data)
            .filter(([, up]) => up === false)
            .map(([name]) => name),
        };
      throw new ApiError(res.status, "error");
    },
  };
}
