import { z } from "zod";
import { api, UpstreamError } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";

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
    if (e instanceof UpstreamError && (e.status === 404 || e.status === 422))
      return json(202);
    const { status, code } = authCode(e, "other");
    if (code === "rate_limited" || code === "unavailable")
      return json(status, { code });
  }
  return json(202);
}
