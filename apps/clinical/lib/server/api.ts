import { callUpstream } from "@mhai/api-client/server/upstream";

export { UpstreamError } from "@mhai/api-client/server/upstream";

export function apiBase(): string {
  const u = process.env.MHAI_API_URL;
  if (!u) throw new Error("MHAI_API_URL is not set");
  return `${u.replace(/\/+$/, "")}/api/v1`;
}

/** Server-side call to the MHAI API. Keeps only the problem `code`. */
export async function api<T>(
  path: string,
  opts?: Parameters<typeof callUpstream>[2],
): Promise<T> {
  return callUpstream<T>(apiBase(), path, opts);
}
