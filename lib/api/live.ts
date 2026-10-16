import { reportUnauthorized } from "../auth/events";
import type { MhaiClient } from "./client";
import type {
  ClinicalResultOut,
  CorrectionOut,
  FeedbackStatsOut,
  QueryStatusOut,
  Readiness,
  WriteOpts,
} from "./contract";
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
    keepalive = false,
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
        // An approval sent while the page unloads must outlive the page.
        ...(keepalive ? { keepalive: true } : {}),
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
    keepalive = false,
  ): Promise<T> {
    const { res, data } = await call(path, method, body, extra, keepalive);
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
  const decide = async (path: string, body: unknown, opts?: WriteOpts) => {
    await ok<unknown>(
      path,
      "POST",
      body,
      keyHeader(opts),
      opts?.keepalive === true,
    );
  };
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
    listPendingCorrections: () =>
      ok<CorrectionOut[]>("/corrections?status=pending"),
    listMyCorrections: () => ok<CorrectionOut[]>("/corrections/mine"),
    listMyReviews: () => ok<CorrectionOut[]>("/corrections/reviewed"),
    approveCorrection: (c, opts) =>
      decide(`/corrections/${id(c)}/approve`, undefined, opts),
    rejectCorrection: (c, r, opts) =>
      decide(`/corrections/${id(c)}/reject`, r, opts),
    withdrawCorrection: (c, opts) =>
      decide(`/corrections/${id(c)}/withdraw`, undefined, opts),
    getMyFeedbackStats: () => ok<FeedbackStatsOut>("/feedback/stats/mine"),
  };
}
