import { z } from "zod";
import { api, UpstreamError } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";

const Body = z.object({ email: z.string().trim().min(3).max(320) });

/** Always 202 for an unknown or malformed address, so no account is revealed. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(202);
  try {
    await api("/auth/password/forgot", {
      method: "POST",
      body: { email: body.data.email },
    });
  } catch (e) {
    // Only outages and rate limits surface; every other answer looks alike.
    const st = e instanceof UpstreamError ? e.status : 503;
    if (st >= 500) return json(503, { code: "unavailable" });
    if (st === 429) return json(429, { code: "rate_limited" });
  }
  return json(202);
}
