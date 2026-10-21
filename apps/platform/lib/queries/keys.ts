import { READ_RETRY } from "@mhai/api-client/network";

/**
 * Query-key roots, one per area. Each area's hooks live in their own file
 * under lib/queries/ and build their keys from these roots.
 */
export const queryKeys = {
  devices: ["devices"] as const,
  hospitals: ["hospitals"] as const,
  team: ["team"] as const,
  activity: ["activity"] as const,
};

/** The query client's defaults: memory-only cache, no retry on a 4xx. */
export const QUERY_DEFAULTS = {
  queries: { ...READ_RETRY, refetchOnWindowFocus: false },
};
