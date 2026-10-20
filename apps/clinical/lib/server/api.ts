export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "UpstreamError";
  }
}

export function apiBase(): string {
  const u = process.env.MHAI_API_URL;
  if (!u) throw new Error("MHAI_API_URL is not set");
  return `${u.replace(/\/+$/, "")}/api/v1`;
}

/** Server-side call to the MHAI API. Keeps only the problem `code`. */
export async function api<T>(
  path: string,
  {
    method = "GET",
    body,
    token,
    timeoutMs = 15_000,
    fetchImpl = fetch,
  }: {
    method?: string;
    body?: unknown;
    token?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<T> {
  const url = `${apiBase()}${path}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new UpstreamError(503, "unavailable");
  }
  if (!res.ok) {
    let code = "error";
    try {
      const p = (await res.json()) as { code?: unknown };
      if (typeof p.code === "string") code = p.code;
    } catch {
      // Not problem+json: keep the generic code.
    }
    throw new UpstreamError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
