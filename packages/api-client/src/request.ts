import { ApiError } from "./errors";

export interface RequestOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** A write sent while the page unloads must outlive the page. */
  keepalive?: boolean;
}

export interface ApiRequestConfig {
  /** The app's own API proxy, such as "/api/v1". */
  prefix: string;
  /** Called on a 401, before the call throws `session_expired`. */
  onUnauthorized: () => void;
}

/** The request helpers for one app's API proxy. */
export function createApiRequest({ prefix, onUnauthorized }: ApiRequestConfig) {
  /**
   * One call to the app's API proxy: no network → `network`, 401 → signed out.
   * Returns the response and its JSON body (null when there is none).
   */
  async function apiRequest(
    fetchImpl: typeof fetch,
    path: string,
    { method = "GET", body, headers, keepalive = false }: RequestOpts = {},
  ): Promise<{ res: Response; data: Record<string, unknown> | null }> {
    let res: Response;
    try {
      res = await fetchImpl(`${prefix}${path}`, {
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
      onUnauthorized();
      throw new ApiError(401, "session_expired");
    }
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { res, data };
  }

  /** Like `apiRequest`, but a refusal becomes an `ApiError` with only its code. */
  async function apiOk<T>(
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

  return { apiRequest, apiOk };
}

/** The Idempotency-Key header for a write, when it has one. */
export const keyHeader = (opts?: { idempotencyKey?: string }) =>
  opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined;
