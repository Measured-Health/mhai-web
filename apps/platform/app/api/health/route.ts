import { backendReady } from "@/lib/server/backend";

/**
 * Docker's health check (R8): whether this app can reach core now. No
 * detail, no session; on http it is always ok.
 */
export function GET() {
  const ok = backendReady();
  return Response.json(
    { status: ok ? "ok" : "unavailable" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
