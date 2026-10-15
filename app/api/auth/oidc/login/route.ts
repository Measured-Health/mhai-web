import { apiBase } from "@/lib/server/api";

/**
 * Sends the browser to the API's hospital sign-on. The return origin comes
 * from X-Forwarded-Proto and Host, never the request URL: behind nginx the URL
 * is the container's address.
 */
export async function GET(req: Request) {
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
