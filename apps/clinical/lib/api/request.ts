import { createApiRequest } from "@mhai/api-client/request";
import { reportUnauthorized } from "../auth/events";

export { keyHeader, type RequestOpts } from "@mhai/api-client/request";

/**
 * Calls to this app's /api/v1 proxy: no network → `network`, 401 → signed out.
 * `apiOk` turns a refusal into an `ApiError` with only its code.
 */
export const { apiRequest, apiOk } = createApiRequest({
  prefix: "/api/v1",
  onUnauthorized: reportUnauthorized,
});
