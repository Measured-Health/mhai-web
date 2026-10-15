import { z } from "zod";
import { api, UpstreamError } from "@/lib/server/api";
import type { ApiLoginOk } from "@/lib/server/map-user";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { startSession } from "@/lib/server/session";

const Body = z.object({ code: z.string().min(1).max(2048) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(401, { code: "sso_failed" });
  try {
    const r = await api<ApiLoginOk>("/auth/oidc/exchange", {
      method: "POST",
      body: { code: body.data.code },
    });
    return json(200, await startSession(r));
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 503)
      return json(503, { code: "unavailable" });
    if (!(e instanceof UpstreamError))
      return json(503, { code: "unavailable" });
    return json(401, { code: "sso_failed" });
  }
}
