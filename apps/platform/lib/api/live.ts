import { ApiError } from "@mhai/api-client/errors";
import { createApiRequest, keyHeader } from "@mhai/api-client/request";
import { reportUnauthorized } from "@/lib/auth/events";
import { TooManyRowsError } from "./audit-contract";
import { liveAudit } from "./live-audit";
import {
  BlockedError,
  type PlatformClient,
  type RemovalBlock,
  type WriteOpts,
} from "./contract";
import type { EmrClient } from "./emr-contract";
import { dayLabel } from "@mhai/ui/clearances";
import type {
  Clearance,
  ClearancesClient,
  NamedAccessOut,
} from "./clearances-contract";
import type { HoldsClient } from "./holds-contract";
import type { SettingsClient } from "./settings-contract";

const { apiRequest, apiBlob } = createApiRequest({
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

/** Platform settings (Plan 8c): rows `platform/settings…` of the shape table. */
function settingsLive(ok: LiveOk): SettingsClient {
  const id = encodeURIComponent;
  const request = (x: string, rest: string) =>
    `/settings/requests/${id(x)}${rest}`;
  return {
    getSettings: () => ok("/settings"),
    previewRetention: (type, days) =>
      ok(
        `/settings/retention/${id(type)}/preview${query({ days: String(days) })}`,
      ),
    setRetention: (type, b, o) =>
      ok(`/settings/retention/${id(type)}`, "PUT", b, o),
    setCleanUpPaused: (b, o) => ok("/settings/retention-pause", "PUT", b, o),
    setTriage: (b, o) => ok("/settings/triage", "PUT", b, o),
    approveRequest: (x, b, o) => ok(request(x, "/approve"), "POST", b, o),
    cancelRequest: (x, b, o) => ok(request(x, "/cancel"), "POST", b, o),
    resetFeedbackBuffer: (b, o) =>
      ok("/settings/feedback-buffer/reset", "POST", b, o),
  };
}

/** Record connections (Plan 13): rows `platform/emr…` of the shape table. */
function emrLive(ok: LiveOk): EmrClient {
  const id = encodeURIComponent;
  const connection = (x: string, rest = "") =>
    `/emr/connections/${id(x)}${rest}`;
  return {
    listConnectorTypes: () => ok("/emr/connector-types"),
    listConnections: (q) =>
      ok(`/emr/connections${query({ hospital: q.hospital, state: q.state })}`),
    getConnection: (x) => ok(connection(x)),
    addConnection: (hospital, b, o) =>
      ok(`/hospitals/${id(hospital)}/emr/connections`, "POST", b, o),
    updateConnection: (x, b, o) => ok(connection(x), "PATCH", b, o),
    setConnectionEnabled: (x, b, o) =>
      ok(connection(x, "/enabled"), "PUT", b, o),
    testConnection: (x, o) => ok(connection(x, "/test"), "POST", undefined, o),
  };
}

/**
 * A file under /platform, never cached: refused like any call, and 502
 * `bad_gateway` when it isn't one of the `accept` types.
 */
export type LiveBlob = (
  path: string,
  accept: readonly string[],
) => Promise<Blob>;

/** The page images a letter is viewed as: never the file itself. */
const PAGE_TYPES = ["image/png", "image/jpeg"] as const;

/**
 * A letter must carry its hospital's day, and the switch Measured Health's
 * (what a sign-off date is checked against): one without a real `today`
 * (YYYY-MM-DD) fails closed, as a bad reply, rather than have the browser
 * guess the day.
 */
function withDay<T extends { today: string }>(c: T): T {
  const today = (c as { today?: unknown } | null)?.today;
  try {
    if (typeof today === "string" && dayLabel(today)) return c;
  } catch {
    // Not a calendar day: refused below.
  }
  throw new ApiError(502, "bad_gateway");
}

/**
 * Clearance letters and the named-access switch (Plan 11b): rows
 * `platform/clearances…` and `platform/named-access…` of the shape table.
 */
function clearancesLive(ok: LiveOk, blob: LiveBlob): ClearancesClient {
  const id = encodeURIComponent;
  const letter = (x: string, rest = "") => `/clearances/${id(x)}${rest}`;
  const request = (x: string, rest: string) =>
    `/named-access/requests/${id(x)}${rest}`;
  return {
    listClearances: async (q) => {
      const r: Awaited<ReturnType<ClearancesClient["listClearances"]>> =
        await ok(
          `/clearances${query({
            status: q.status,
            hospital: q.hospital,
            covers: q.covers,
            cursor: q.cursor,
          })}`,
        );
      if (!Array.isArray(r?.clearances)) throw new ApiError(502, "bad_gateway");
      return { ...r, clearances: r.clearances.map(withDay) };
    },
    getClearance: (x) => ok<Clearance>(letter(x)).then(withDay),
    getClearancePage: (x, n) =>
      blob(letter(x, `/pages/${Math.trunc(n)}`), PAGE_TYPES),
    verifyClearance: (x, b, o) =>
      ok<Clearance>(letter(x, "/verify"), "POST", b, o).then(withDay),
    rejectClearance: (x, b, o) =>
      ok<Clearance>(letter(x, "/reject"), "POST", b, o).then(withDay),
    revokeClearance: (x, b, o) =>
      ok<Clearance>(letter(x, "/revoke"), "POST", b, o).then(withDay),
    getNamedAccess: () => ok<NamedAccessOut>("/named-access").then(withDay),
    requestNamedAccess: (b, o) =>
      ok<NamedAccessOut>("/named-access/requests", "POST", b, o).then(withDay),
    approveNamedAccess: (x, b, o) =>
      ok<NamedAccessOut>(request(x, "/approve"), "POST", b, o).then(withDay),
    cancelNamedAccess: (x, b, o) =>
      ok<NamedAccessOut>(request(x, "/cancel"), "POST", b, o).then(withDay),
    lowerNamedAccess: (b, o) =>
      ok<NamedAccessOut>("/named-access/lower", "POST", b, o).then(withDay),
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
      if (
        res.status === 422 &&
        code === "too_many_rows" &&
        typeof data?.rows === "number" &&
        Number.isSafeInteger(data.rows) &&
        data.rows >= 0
      )
        throw new TooManyRowsError(data.rows);
      throw new ApiError(res.status, code);
    }
    return data as T;
  };

  const blob: LiveBlob = (path, accept) =>
    apiBlob(fetchImpl, `/platform${path}`, accept);

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
    ...liveAudit(ok, blob),
    // The health poll is background too: it must not keep a session alive.
    getHealth: (o) =>
      ok(
        "/health",
        "GET",
        undefined,
        undefined,
        o?.background ? BACKGROUND : undefined,
      ),
    listJobs: (q) =>
      ok(
        `/jobs${query({
          status: q.status,
          type: q.type,
          hospital: q.hospital,
          kind: q.kind,
          cursor: q.cursor,
        })}`,
      ),
    retryJobs: (b, o) => ok("/jobs/retry", "POST", b, o),
    cancelJobs: (b, o) => ok("/jobs/cancel", "POST", b, o),
    ...holdsLive(ok),
    ...settingsLive(ok),
    ...emrLive(ok),
    ...clearancesLive(ok, blob),
  };
}
