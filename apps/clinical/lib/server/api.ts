import { callUpstream } from "@mhai/api-client/server/upstream";
import { NATS_API_ORIGIN, backendFetch, onNats } from "./backend";

export { UpstreamError } from "@mhai/api-client/server/upstream";

/**
 * Core's API base. On NATS the origin is a name that never resolves and only
 * selects the transport (R2): MHAI_API_URL isn't needed there.
 */
export function apiBase(): string {
  if (onNats()) return `${NATS_API_ORIGIN}/api/v1`;
  const u = process.env.MHAI_API_URL;
  if (!u) throw new Error("MHAI_API_URL is not set");
  return `${u.replace(/\/+$/, "")}/api/v1`;
}

/** Server-side call to the MHAI API. Keeps only the problem `code`. */
export async function api<T>(
  path: string,
  opts?: Parameters<typeof callUpstream>[2],
): Promise<T> {
  return callUpstream<T>(apiBase(), path, {
    fetchImpl: backendFetch,
    ...opts,
  });
}
