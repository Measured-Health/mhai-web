import { NextResponse, type NextRequest } from "next/server";
import {
  newNonce,
  securityHeaders,
  wantsHsts,
} from "@mhai/api-client/server/security-headers";

// A full page load of a consultation or its printout starts a new, empty
// in-memory session, so the consultation can't be there. Send those loads to
// a 404 page. In-app navigation (RSC requests and prefetches) skips this and
// keeps working, because the session is still in memory.
// Revisit when consultations can be fetched again after a reload (Plan 2).
const ENDED = /^\/(c|print)\/[^/]+$/;

function endedLoad(request: NextRequest): boolean {
  return (
    ENDED.test(request.nextUrl.pathname) &&
    !request.headers.has("rsc") &&
    !request.headers.has("next-router-prefetch")
  );
}

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

  const init = { request: { headers: requestHeaders } };
  const response = endedLoad(request)
    ? NextResponse.rewrite(new URL("/ended", request.url), init)
    : NextResponse.next(init);
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}

// The matcher must be a static literal.
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
