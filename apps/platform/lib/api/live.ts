import { ApiError } from "@mhai/api-client/errors";
import { createApiRequest, keyHeader } from "@mhai/api-client/request";
import { reportUnauthorized } from "@/lib/auth/events";
import {
  BlockedError,
  type PlatformClient,
  type RemovalBlock,
  type WriteOpts,
} from "./contract";
import type { HoldsClient } from "./holds-contract";

const { apiRequest } = createApiRequest({
  prefix: "/api/v1",
  onUnauthorized: reportUnauthorized,
});

const BLOCKS: readonly RemovalBlock[] = [
  "legal_hold",
  "retention",
  "export_required",
];

/** Marks a read as background: the proxy won't count it as activity. */
const BACKGROUND = { "X-MHAI-Background": "1" };

/** `?a=1&b=2` from the filters that are set, or "". */
function query(q: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * The live client's one way to call the API: a path under /platform, the
 * method, the body, the write's key and any extra headers. Each area's
 * client is built on it.
 */
export type LiveOk = <T>(
  path: string,
  method?: string,
  body?: unknown,
  opts?: WriteOpts,
  extraHeaders?: Record<string, string>,
) => Promise<T>;

/** Legal holds (Plan 8a): rows `platform/legal-holds…` of the shape table. */
function holdsLive(ok: LiveOk): HoldsClient {
  const hold = (x: string, rest = "") =>
    `/legal-holds/${encodeURIComponent(x)}${rest}`;
  return {
    listHolds: (q) =>
      ok(
        `/legal-holds${query({
          status: q.status,
          hospital: q.hospital,
          q: q.q,
          cursor: q.cursor,
        })}`,
      ),
    getHold: (x) => ok(hold(x)),
    placeHold: (b, o) => ok("/legal-holds", "POST", b, o),
    editHold: (x, b, o) => ok(hold(x), "PATCH", b, o),
    requestLift: (x, b, o) => ok(hold(x, "/lift"), "POST", b, o),
    approveLift: (x, b, o) => ok(hold(x, "/lift/approve"), "POST", b, o),
    cancelLift: (x, b, o) => ok(hold(x, "/lift/cancel"), "POST", b, o),
    undoLift: (x, b, o) => ok(hold(x, "/lift/undo"), "POST", b, o),
  };
}

/**
 * The platform API through this app's /api/v1 proxy (the token stays
 * server-side). Every path is a row of the proxy's shape table.
 */
export function createLivePlatformClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): PlatformClient {
  const ok: LiveOk = async <T>(
    path: string,
    method = "GET",
    body?: unknown,
    opts?: WriteOpts,
    extraHeaders?: Record<string, string>,
  ): Promise<T> => {
    const { res, data } = await apiRequest(fetchImpl, `/platform${path}`, {
      method,
      body,
      headers: { ...keyHeader(opts), ...extraHeaders },
    });
    if (!res.ok) {
      const code = typeof data?.code === "string" ? data.code : "error";
      if (res.status === 409 && code === "blocked") {
        const list = Array.isArray(data?.blocking) ? data.blocking : [];
        throw new BlockedError(
          list.filter((b): b is RemovalBlock =>
            (BLOCKS as readonly unknown[]).includes(b),
          ),
        );
      }
      throw new ApiError(res.status, code);
    }
    return data as T;
  };

  const id = encodeURIComponent;
  const h = (hospital: string, rest = "") =>
    `/hospitals/${id(hospital)}${rest}`;

  return {
    listHospitals: (q) =>
      ok(`/hospitals${query({ status: q.status, q: q.q, cursor: q.cursor })}`),
    addHospital: (b, o) => ok("/hospitals", "POST", b, o),
    getHospital: (x) => ok(h(x)),
    updateHospital: (x, b, o) => ok(h(x), "PATCH", b, o),
    deactivate: (x, b, o) => ok(h(x, "/deactivate"), "POST", b, o),
    reactivate: (x, b, o) => ok(h(x, "/reactivate"), "POST", b, o),
    requestRemoval: (x, b, o) => ok(h(x, "/removal"), "POST", b, o),
    approveRemoval: (x, b, o) => ok(h(x, "/removal/approve"), "POST", b, o),
    cancelRemoval: (x, o) => ok(h(x, "/removal/cancel"), "POST", undefined, o),
    getSso: (x) => ok(h(x, "/sso")),
    saveSso: (x, b, o) => ok(h(x, "/sso"), "PUT", b, o),
    testSso: (x, o) => ok(h(x, "/sso/test"), "POST", undefined, o),
    inviteAdmin: (x, b, o) => ok(h(x, "/invites"), "POST", b, o),
    resendInvite: (x, inv, o) =>
      ok(h(x, `/invites/${id(inv)}/resend`), "POST", undefined, o),
    listTeam: () => ok("/team"),
    inviteTeam: (b, o) => ok("/team/invites", "POST", b, o),
    changeRole: (m, b, o) => ok(`/team/${id(m)}`, "PATCH", b, o),
    async removeMember(m, b, o) {
      await ok(`/team/${id(m)}`, "DELETE", b, o);
    },
    listActivity: (q) =>
      ok(`/activity${query({ hospital: q.hospital, cursor: q.cursor })}`),
    getAnalytics: (period) => ok(`/analytics${query({ period })}`),
    getChangeSeries: (c, period) =>
      ok(`/analytics/changes/${id(c)}/series${query({ period })}`),
    getHospitalSeries: (x, measure, period) =>
      ok(`/analytics/hospitals/${id(x)}/series${query({ measure, period })}`),
    followUp: (c, b, o) =>
      ok(`/analytics/changes/${id(c)}/follow-up`, "PUT", b, o),
    undoFollowUp: (c, b, o) =>
      ok(`/analytics/changes/${id(c)}/follow-up`, "DELETE", b, o),
    // The bell's poll is background: it must not count as activity (the
    // proxy then leaves the server's idle clock alone).
    listNotifications: () =>
      ok("/notifications", "GET", undefined, undefined, BACKGROUND),
    markSeen: (b, o) => ok("/notifications/seen", "POST", b, o),
    getEmailPref: () => ok("/me/analytics-email"),
    setEmailPref: (b, o) => ok("/me/analytics-email", "PUT", b, o),
    ...holdsLive(ok),
  };
}
