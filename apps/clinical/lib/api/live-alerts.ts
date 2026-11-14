import type { z } from "zod";
import { handledFields } from "./alert-handled";
import {
  ALERT_PAGE_SCHEMA,
  ALERT_SCHEMA,
  NOTIFICATION_SETTINGS_SCHEMA,
  UNREAD_COUNT_SCHEMA,
} from "./alerts-schema";
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
  if (q.sent_to) p.set("sent_to", q.sent_to);
  if (q.cursor) p.set("cursor", q.cursor);
  if (q.limit) p.set("limit", String(q.limit));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/**
 * Reads a reply strictly (core openapi 1.20.0): anything that doesn't match
 * is 502 `bad_gateway`, never shown in part.
 */
function read<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError(502, "bad_gateway");
  return r.data;
}

/** Patient alerts and notification settings through this app's /api/v1 proxy. */
export function createLiveAlertsClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AlertsClient {
  async function send(
    path: string,
    method = "GET",
    body?: unknown,
    opts?: WriteOpts,
  ): Promise<unknown> {
    const { res, data } = await apiRequest(fetchImpl, path, {
      method,
      body,
      headers: keyHeader(opts),
    });
    if (res.ok) return data;
    const code = typeof data?.code === "string" ? data.code : "error";
    if (res.status === 409 && code === "already_handled")
      throw new AlertHandledError(handledFields(data));
    throw new ApiError(res.status, code);
  }
  const id = encodeURIComponent;
  return {
    listAlerts: async (q) =>
      read(ALERT_PAGE_SCHEMA, await send(`/alerts${query(q)}`)),
    getUnreadCount: async () =>
      read(UNREAD_COUNT_SCHEMA, await send("/alerts/unread-count")),
    acknowledgeAlert: async (a, o) =>
      read(
        ALERT_SCHEMA,
        await send(`/alerts/${id(a)}/acknowledge`, "POST", undefined, o),
      ),
    dismissAlert: async (a, d, o) =>
      read(ALERT_SCHEMA, await send(`/alerts/${id(a)}/dismiss`, "POST", d, o)),
    getNotificationSettings: async () =>
      read(
        NOTIFICATION_SETTINGS_SCHEMA,
        await send("/me/notification-settings"),
      ),
    updateNotificationSettings: async (p, o) =>
      read(
        NOTIFICATION_SETTINGS_SCHEMA,
        await send("/me/notification-settings", "PATCH", p, o),
      ),
  };
}
