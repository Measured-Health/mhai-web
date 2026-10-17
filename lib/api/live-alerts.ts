import { handledFields } from "./alert-handled";
import type { AlertsClient } from "./alerts";
import type { AlertQuery } from "./alerts-contract";
import type { WriteOpts } from "./contract";
import { AlertHandledError, ApiError } from "./errors";
import { apiRequest, keyHeader } from "./request";

const query = (q: AlertQuery) => {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.severity) p.set("severity", q.severity);
  if (q.source) p.set("source", q.source);
  if (q.cursor) p.set("cursor", q.cursor);
  if (q.limit) p.set("limit", String(q.limit));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** Patient alerts and notification settings through this app's /api/v1 proxy. */
export function createLiveAlertsClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AlertsClient {
  async function send<T>(
    path: string,
    method = "GET",
    body?: unknown,
    opts?: WriteOpts,
  ): Promise<T> {
    const { res, data } = await apiRequest(fetchImpl, path, {
      method,
      body,
      headers: keyHeader(opts),
    });
    if (res.ok) return data as T;
    const code = typeof data?.code === "string" ? data.code : "error";
    if (res.status === 409 && code === "already_handled")
      throw new AlertHandledError(handledFields(data));
    throw new ApiError(res.status, code);
  }
  const id = encodeURIComponent;
  return {
    listAlerts: (q) => send(`/alerts${query(q)}`),
    getUnreadCount: () => send("/alerts/unread-count"),
    acknowledgeAlert: (a, o) =>
      send(`/alerts/${id(a)}/acknowledge`, "POST", undefined, o),
    dismissAlert: (a, d, o) => send(`/alerts/${id(a)}/dismiss`, "POST", d, o),
    getNotificationSettings: () => send("/me/notification-settings"),
    updateNotificationSettings: (p, o) =>
      send("/me/notification-settings", "PATCH", p, o),
  };
}
