import { ApiError } from "@mhai/api-client/errors";
import { reportUnauthorized } from "@/lib/auth/events";
import type { AuditClient } from "./audit-contract";
import type { LiveOk } from "./live";

/** Marks a read as background: the proxy won't count it as activity. */
const BACKGROUND = { "X-MHAI-Background": "1" };

/** `?a=1&b=2` from the filters that are set, or "". */
function query(q: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** The audit log calls, through the same proxy as the rest of the client. */
export function liveAudit(ok: LiveOk, fetchImpl: typeof fetch): AuditClient {
  const id = encodeURIComponent;
  return {
    listAudit: (f, cursor) =>
      ok(
        `/audit${query({
          hospital: f.hospital,
          person: f.person,
          type: f.type?.length ? f.type.join(",") : undefined,
          outcome: f.outcome,
          flagged: f.flagged ? "true" : undefined,
          from: f.from,
          to: f.to,
          q: f.q,
          limit: "50",
          cursor,
        })}`,
      ),
    getAuditEvent: (e) => ok(`/audit/${id(e)}`),
    getAuditPatients: (e) => ok(`/audit/${id(e)}/patients`),
    searchAuditPeople: (q) => ok(`/audit/people${query({ q })}`),
    listAuditHospitals: () => ok("/audit/hospitals"),
    async reportUndisplayable(ids, o) {
      await ok("/audit/undisplayable", "POST", { ids }, o);
    },
    listNamedAccess: (f, cursor) =>
      ok(
        `/audit/named-access${query({
          hospital: f.hospital,
          person: f.person,
          clearance: f.clearance,
          from: f.from,
          to: f.to,
          cursor,
        })}`,
      ),
    createExport: (b, o) => ok("/audit/exports", "POST", b, o),
    async downloadExport(e) {
      let res: Response;
      try {
        res = await fetchImpl(`/api/v1/platform/audit/exports/${id(e)}/file`, {
          method: "GET",
          headers: { Accept: "text/csv, application/zip" },
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        throw new ApiError(0, "network");
      }
      if (res.status === 401) {
        reportUnauthorized();
        throw new ApiError(401, "session_expired");
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          code?: unknown;
        } | null;
        throw new ApiError(
          res.status,
          typeof data?.code === "string" ? data.code : "error",
        );
      }
      return res.blob();
    },
    listExports: (cursor) => ok(`/audit/exports${query({ cursor })}`),
    startCheck: (o) => ok("/audit/verify", "POST", undefined, o),
    // The status poll and a run's poll are background: they must not keep
    // the session alive.
    getIntegrityStatus: () =>
      ok("/audit/verify/status", "GET", undefined, undefined, BACKGROUND),
    listRuns: (cursor) => ok(`/audit/verify/runs${query({ cursor })}`),
    getRun: (r) =>
      ok(
        `/audit/verify/runs/${id(r)}`,
        "GET",
        undefined,
        undefined,
        BACKGROUND,
      ),
    addOutcome: (r, b, o) =>
      ok(`/audit/verify/runs/${id(r)}/outcome`, "POST", b, o),
  };
}
