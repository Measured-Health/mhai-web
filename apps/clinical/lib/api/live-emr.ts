import type { EmrClient } from "./emr-contract";
import { apiOk, keyHeader } from "./request";

const PATH = "/hospital/alert-settings";

/**
 * Alert settings through this app's /api/v1 proxy (the token stays
 * server-side). A refusal keeps only its code.
 */
export function createLiveEmr({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): EmrClient {
  return {
    getAlertSettings: () => apiOk(fetchImpl, PATH),
    updateAlertSettings: (p, opts) =>
      apiOk(fetchImpl, PATH, {
        method: "PATCH",
        body: p,
        headers: keyHeader(opts),
      }),
  };
}
