/**
 * The security headers both apps send on every page: a strict nonce-based
 * Content Security Policy plus the browser hardening headers. Each app's
 * `proxy.ts` makes a fresh nonce per request, puts the policy on the request
 * (Next reads the nonce from it and adds it to its own scripts and styles)
 * and copies these headers onto the response. Server only; no Next imports,
 * so the policy is tested on its own.
 */

export type ReferrerPolicy = "no-referrer" | "same-origin";

export interface SecurityHeaderOptions {
  /** A fresh, unguessable nonce for this response (see `newNonce`). */
  nonce: string;
  /** `next dev` only: allows eval and inline styles for the dev overlay. */
  dev: boolean;
  /** Send Strict-Transport-Security (production on a real host only). */
  hsts: boolean;
  referrerPolicy: ReferrerPolicy;
}

/** 16 random bytes, base64: a new nonce for every response. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The policy. In development React uses eval to rebuild server error stacks,
 * and Next's dev overlay applies inline styles. Browsers ignore
 * 'unsafe-inline' when a nonce is present, so dev styles go without the
 * nonce. Never in a build.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  const devEval = dev ? " 'unsafe-eval'" : "";
  const styleSrc = dev
    ? "style-src 'self' 'unsafe-inline'"
    : `style-src 'self' 'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    styleSrc,
    // data: for the named-list watermark (an SVG drawn in the page, used as
    // a CSS background). blob: for a clearance letter's page, held in memory
    // and shown through an object URL.
    "img-src 'self' data: blob:",
    // next/font self-hosts the fonts under /_next/static.
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export const HSTS = "max-age=31536000; includeSubDomains";

/** The response headers, by name. */
export function securityHeaders(
  opts: SecurityHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(opts.nonce, opts.dev),
    // Old browsers that ignore frame-ancestors.
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": opts.referrerPolicy,
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (opts.hsts) headers["Strict-Transport-Security"] = HSTS;
  return headers;
}

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * HSTS only from a production server on a real host name: never from
 * `next dev`, and never for localhost (a test run or a local `next start`),
 * where it would pin the browser to https for every local app.
 */
export function wantsHsts(nodeEnv: string | undefined, hostname: string) {
  return nodeEnv === "production" && !LOCAL.has(hostname.toLowerCase());
}
