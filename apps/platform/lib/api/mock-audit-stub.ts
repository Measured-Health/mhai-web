import { ApiError } from "@mhai/api-client/errors";
import type { AuditClient } from "./audit-contract";

const unavailable = async (): Promise<never> => {
  throw new ApiError(503, "unavailable");
};

/** Placeholder until the mock audit log exists: every call is unavailable. */
export function unimplementedAudit(): AuditClient {
  return {
    listAudit: unavailable,
    getAuditEvent: unavailable,
    getAuditPatients: unavailable,
    searchAuditPeople: unavailable,
    listAuditHospitals: unavailable,
    reportUndisplayable: unavailable,
    listNamedAccess: unavailable,
    createExport: unavailable,
    downloadExport: unavailable,
    listExports: unavailable,
    startCheck: unavailable,
    getIntegrityStatus: unavailable,
    listRuns: unavailable,
    getRun: unavailable,
    addOutcome: unavailable,
  };
}
