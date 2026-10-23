import { ApiError, refusal } from "./errors";

export interface RequestOpts {
  method?: string;
  /** Sent as JSON. Not together with `form`. */
  body?: unknown;
  /**
   * Sent as multipart/form-data (a file upload). No Content-Type is set, so
   * the browser adds the boundary. Not together with `body`.
   */
  form?: FormData;
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
  /** Sends one call: no network → `network`, 401 → signed out. */
  async function send(
    fetchImpl: typeof fetch,
    path: string,
    accept: string,
    { method = "GET", body, form, headers, keepalive = false }: RequestOpts,
  ): Promise<Response> {
    if (body !== undefined && form !== undefined)
      throw new TypeError("A request can't have both a body and a form");
    let res: Response;
    try {
      res = await fetchImpl(`${prefix}${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: accept,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
        ...(keepalive ? { keepalive: true } : {}),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.status === 401) {
      onUnauthorized();
      throw new ApiError(401, "session_expired");
    }
    return res;
  }

  const json = async (res: Response) =>
    (await res.json().catch(() => null)) as Record<string, unknown> | null;

  /**
   * One call to the app's API proxy: no network → `network`, 401 → signed out.
   * Returns the response and its JSON body (null when there is none).
   */
  async function apiRequest(
    fetchImpl: typeof fetch,
    path: string,
    opts: RequestOpts = {},
  ): Promise<{ res: Response; data: Record<string, unknown> | null }> {
    const res = await send(fetchImpl, path, "application/json", opts);
    return { res, data: await json(res) };
  }

  /**
   * Like `apiRequest`, but a refusal becomes an `ApiError` with only its
   * code, or a `NotEligibleError` that also keeps the checked ids or emails.
   */
  async function apiOk<T>(
    fetchImpl: typeof fetch,
    path: string,
    opts?: RequestOpts,
  ): Promise<T> {
    const { res, data } = await apiRequest(fetchImpl, path, opts);
    if (!res.ok) throw refusal(res.status, data);
    return data as T;
  }

  /**
   * A GET for a file (a letter's page image, an export), never cached.
   * Refuses like `apiOk`; a reply of a type not in `accept` is 502
   * `bad_gateway`. The caller keeps the Blob in memory only.
   */
  async function apiBlob(
    fetchImpl: typeof fetch,
    path: string,
    accept: readonly string[],
  ): Promise<Blob> {
    const res = await send(fetchImpl, path, accept.join(", "), {});
    if (!res.ok) throw refusal(res.status, await json(res));
    const type = mediaType(res.headers.get("Content-Type") ?? "");
    if (!accept.map(mediaType).includes(type))
      throw new ApiError(502, "bad_gateway");
    // The connection can drop mid-body: a one-shot file can't be fetched again.
    return res.blob().catch(() => {
      throw new ApiError(200, "interrupted");
    });
  }

  return { apiRequest, apiOk, apiBlob };
}

/** "Image/SVG+XML; charset=utf-8" → "image/svg+xml": the bare media type. */
export const mediaType = (contentType: string) =>
  contentType.split(";")[0].trim().toLowerCase();

/** The Idempotency-Key header for a write, when it has one. */
export const keyHeader = (opts?: { idempotencyKey?: string }) =>
  opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : undefined;
