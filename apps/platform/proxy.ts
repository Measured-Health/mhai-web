import { NextResponse, type NextRequest } from "next/server";
import {
  newNonce,
  securityHeaders,
  wantsHsts,
} from "@mhai/api-client/server/security-headers";

/**
 * A strict Content Security Policy and the other security headers for every
 * page (`@mhai/api-client/server/security-headers`, shared with the clinical
 * app). Each request gets a fresh nonce; Next reads it from the request's CSP
 * header and puts it on its own scripts and styles, so nothing inline runs
 * without it. `x-nonce` is passed on for any page that needs the nonce
 * itself; both overwrite anything the client sent. The root layout calls
 * `headers()`, which makes every page render per request, so each response
 * carries its own nonce.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce();
  const headers = securityHeaders({
    nonce,
    dev: process.env.NODE_ENV === "development",
    hsts: wantsHsts(process.env.NODE_ENV, request.nextUrl.hostname),
    referrerPolicy: "no-referrer",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    headers["Content-Security-Policy"],
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}

// The matcher must be a static literal.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
