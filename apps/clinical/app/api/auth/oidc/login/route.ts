import { apiBase } from "@/lib/server/api";
import { onNats } from "@/lib/server/backend";

/**
 * Sends the browser to the API's hospital sign-on. The return origin comes
 * from X-Forwarded-Proto and Host, never the request URL: behind nginx the URL
 * is the container's address.
 */
export async function GET(req: Request) {
  // Hospital sign-on sends the browser to core itself, which has no
  // browser-facing address on NATS (and no sign-on route yet): unavailable.
  if (onNats())
    return Response.json(
      { code: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https"
      ? "https"
      : "http";
  const host = req.headers.get("host");
  if (!host) return new Response(null, { status: 400 });
  const returnTo = `${proto}://${host}/sign-in/hospital`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${apiBase()}/auth/oidc/login?return_to=${encodeURIComponent(returnTo)}`,
      "Cache-Control": "no-store",
    },
  });
}
