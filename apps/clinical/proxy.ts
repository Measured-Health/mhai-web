import { NextResponse, type NextRequest } from "next/server";
import {
  newNonce,
  securityHeaders,
  wantsHsts,
} from "@mhai/api-client/server/security-headers";

/**
 * A strict Content Security Policy and the other security headers for every
 * page (`@mhai/api-client/server/security-headers`, shared with the platform
 * app). Each request gets a fresh nonce; Next reads it from the request's CSP
 * header and puts it on its own scripts and styles, so nothing inline runs
 * without it. Both request headers overwrite anything the client sent. The
 * root layout calls `headers()`, which makes every page render per request,
 * so each response carries its own nonce.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const headers = securityHeaders({
    nonce,
    dev: process.env.NODE_ENV === "development",
    hsts: wantsHsts(process.env.NODE_ENV, request.nextUrl.hostname),
    // Nothing goes to other origins; same-origin requests keep their Origin
    // header, which the BFF's write check (`sameOrigin`) needs.
    referrerPolicy: "same-origin",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    headers["Content-Security-Policy"],
  );

  // The /c/:id and /print/:id full-load rewrite to /ended is in
  // next.config.ts: Next strips the RSC headers from the request a proxy
  // sees, so only a config rewrite can tell a reload from in-app navigation.
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}

// The matcher must be a static literal.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
