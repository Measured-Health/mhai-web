import { NextResponse, type NextRequest } from "next/server";

/**
 * A strict Content Security Policy for every page. Each request gets a fresh
 * nonce; Next reads it from the request's CSP header and puts it on its own
 * scripts and styles, so nothing inline runs without it. `x-nonce` is passed
 * on for any page that needs the nonce itself. The root layout calls
 * `headers()`, which makes every page render per request, so each response
 * carries its own nonce.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  // In development React uses eval to rebuild server error stacks, and Next's
  // dev overlay applies inline styles. Browsers ignore 'unsafe-inline' when a
  // nonce is present, so dev styles go without the nonce. Never in a build.
  const devEval = dev ? " 'unsafe-eval'" : "";
  const styleSrc = dev
    ? "style-src 'self' 'unsafe-inline'"
    : `style-src 'self' 'nonce-${nonce}'`;
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    styleSrc,
    // blob: for a clearance letter's page, held in memory and shown through
    // an object URL (never fetched by the image itself).
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}

// The matcher must be a static literal.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
