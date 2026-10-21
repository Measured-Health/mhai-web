import { UpstreamError, callUpstream } from "@mhai/api-client/server/upstream";

export { UpstreamError };

/** Sent on every upstream call so the API issues platform-audience tokens (spec §13). */
export const AUDIENCE_HEADER = "X-MHAI-Audience";
export const AUDIENCE = "platform";

export function apiBase(): string {
  const u = process.env.MHAI_API_URL;
  if (!u) throw new Error("MHAI_API_URL is not set");
  return `${u.replace(/\/+$/, "")}/api/v1`;
}

/** `fetch` with the platform audience header added. */
export const platformFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set(AUDIENCE_HEADER, AUDIENCE);
  return fetch(input, { ...init, headers });
};

/** Server-side call to the MHAI API. Keeps only the problem `code`. */
export function api<T>(
  path: string,
  opts: Omit<NonNullable<Parameters<typeof callUpstream>[2]>, "fetchImpl"> = {},
): Promise<T> {
  return callUpstream<T>(apiBase(), path, {
    ...opts,
    fetchImpl: platformFetch,
  });
}

export const json = (status: number, body?: object) =>
  body === undefined
    ? new Response(null, { status, headers: { "Cache-Control": "no-store" } })
    : Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const forbidden = () => json(403, { code: "forbidden" });
export const sessionExpired = () => json(401, { code: "session_expired" });

/** Writes must come from this app's own pages (SameSite=Strict plus this). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Host only: X-Forwarded-Host can be supplied by the client.
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type AuthErrorCode =
  | "invalid_credentials"
  | "locked"
  | "mfa_invalid"
  | "mfa_expired"
  | "mfa_locked"
  | "rate_limited"
  | "not_platform"
  | "weak_password"
  | "wrong_password"
  | "session_expired"
  | "unavailable";

/** Maps an upstream failure to the app's auth error codes. */
export function authCode(
  e: unknown,
  ctx: "login" | "mfa" | "current" | "other",
): { status: number; code: AuthErrorCode } {
  if (!(e instanceof UpstreamError))
    return { status: 503, code: "unavailable" };
  switch (e.code) {
    case "login_locked":
      return { status: 429, code: "locked" };
    case "mfa_locked":
      return { status: 429, code: "mfa_locked" };
    case "rate_limited":
      return { status: 429, code: "rate_limited" };
    case "not_platform":
      return { status: 403, code: "not_platform" };
    case "forbidden":
      // Under the platform audience, a refused sign-in means the account
      // can't use this app.
      return ctx === "login" || ctx === "mfa"
        ? { status: 403, code: "not_platform" }
        : { status: 503, code: "unavailable" };
    case "mfa_invalid":
      return { status: 401, code: "mfa_invalid" };
    case "validation_failed":
      return {
        status: 422,
        code: ctx === "login" ? "invalid_credentials" : "weak_password",
      };
    case "unauthenticated":
      return {
        status: 401,
        code:
          ctx === "login"
            ? "invalid_credentials"
            : ctx === "mfa"
              ? "mfa_expired"
              : ctx === "current"
                ? "wrong_password"
                : "session_expired",
      };
    case "token_expired":
      return {
        status: 401,
        code: ctx === "mfa" ? "mfa_expired" : "session_expired",
      };
    default:
      return { status: 503, code: "unavailable" };
  }
}

/** The JSON body of a request, or null when it isn't JSON. */
export const bodyOf = (req: Request): Promise<unknown> =>
  req.json().catch(() => null);
