import { ApiError } from "./errors";
import type { LookupClient } from "./lookup";
import { readLookup } from "./lookup-schema";
import { apiOk } from "./request";

/**
 * The lookup through this app's /api/v1 proxy: the MRN in a POST body,
 * never the address. The reply is read strictly; one that doesn't match,
 * or names another MRN, is 502 `bad_gateway`. Never retried: every lookup
 * counts towards the clinician's limits.
 */
export function createLiveLookup({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): LookupClient {
  return {
    async lookupPatient(mrn) {
      const raw = await apiOk<unknown>(fetchImpl, "/patients/lookup", {
        method: "POST",
        body: { mrn: mrn.trim() },
      });
      const found = readLookup(raw, mrn);
      if (!found) throw new ApiError(502, "bad_gateway");
      return found;
    },
  };
}
