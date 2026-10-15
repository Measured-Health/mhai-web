import { NextResponse, type NextRequest } from "next/server";

// A full page load of a consultation or its printout starts a new, empty
// in-memory session, so the consultation can't be there. Send those loads to
// a 404 page. In-app navigation (RSC requests and prefetches) skips this and
// keeps working, because the session is still in memory.
// Revisit when consultations can be fetched again after a reload (Plan 2).
export function proxy(request: NextRequest) {
  return NextResponse.rewrite(new URL("/ended", request.url));
}

// The matcher must be a static literal.
export const config = {
  matcher: [
    {
      source: "/c/:id",
      missing: [
        { type: "header", key: "rsc" },
        { type: "header", key: "next-router-prefetch" },
      ],
    },
    {
      source: "/print/:id",
      missing: [
        { type: "header", key: "rsc" },
        { type: "header", key: "next-router-prefetch" },
      ],
    },
  ],
};
