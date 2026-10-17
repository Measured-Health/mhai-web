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
import { apiOk, apiRequest, keyHeader } from "./request";

/** The real API, through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): MhaiClient {
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    headers?: Record<string, string>,
    keepalive = false,
  ) => apiRequest(fetchImpl, path, { method, body, headers, keepalive });
  const ok = <T>(
    path: string,
    method = "GET",
    body?: unknown,
    headers?: Record<string, string>,
    keepalive = false,
  ) => apiOk<T>(fetchImpl, path, { method, body, headers, keepalive });
  const id = encodeURIComponent;
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
