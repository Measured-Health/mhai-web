import { z } from "zod";
import type { ApiLoginOk, ApiMfaRequired } from "@/lib/api/auth-contract";
import {
  api,
  authCode,
  bodyOf,
  forbidden,
  json,
  sameOrigin,
} from "@/lib/server/http";
import { startSession, writeMfa } from "@/lib/server/session";

// Unknown fields (a device token, say) are stripped and never sent.
const Body = z.object({
  login: z.string().trim().min(1).max(256),
  password: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await bodyOf(req));
  if (!body.success) return json(400, { code: "invalid_credentials" });
  try {
    const r = await api<ApiLoginOk | ApiMfaRequired>("/auth/login", {
      method: "POST",
      body: { username: body.data.login, password: body.data.password },
    });
    if ("mfa_required" in r && r.mfa_required) {
      if (typeof r.mfa_token !== "string" || !r.mfa_token)
        throw new Error("Malformed two-step response");
      await writeMfa(r.mfa_token);
      return json(200, { status: "mfa_required" });
    }
    const out = await startSession(r as ApiLoginOk);
    return json(out.status, out.body);
  } catch (e) {
    const { status, code } = authCode(e, "login");
    return json(status, { code });
  }
}
