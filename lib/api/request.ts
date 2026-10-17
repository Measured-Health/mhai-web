import { reportUnauthorized } from "../auth/events";
import { ApiError } from "./errors";

export interface RequestOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** A write sent while the page unloads must outlive the page. */
  keepalive?: boolean;
}

/**
 * One call to this app's /api/v1 proxy: no network → `network`, 401 → signed out.
 * Returns the response and its JSON body (null when there is none).
 */
export async function apiRequest(
  fetchImpl: typeof fetch,
  path: string,
  { method = "GET", body, headers, keepalive = false }: RequestOpts = {},
): Promise<{ res: Response; data: Record<string, unknown> | null }> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(keepalive ? { keepalive: true } : {}),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 401) {
    reportUnauthorized();
    throw new ApiError(401, "session_expired");
  }
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { res, data };
}

/** Like `apiRequest`, but a refusal becomes an `ApiError` with only its code. */
export async function apiOk<T>(
  fetchImpl: typeof fetch,
  path: string,
  opts?: RequestOpts,
): Promise<T> {
  const { res, data } = await apiRequest(fetchImpl, path, opts);
  if (!res.ok)
    throw new ApiError(
      res.status,
      typeof data?.code === "string" ? data.code : "error",
    );
  return data as T;
}

/** The Idempotency-Key header for a write, when it has one. */
export const keyHeader = (opts?: { idempotencyKey?: string }) =>
  opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined;
