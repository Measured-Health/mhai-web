import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import type { ApiLoginOk, ApiMfaRequired } from "@/lib/server/map-user";
import { readTrust, startSession, writeMfa } from "@/lib/server/session";

const Body = z.object({
  login: z.string().trim().min(1).max(256),
  password: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "invalid_credentials" });
  try {
    const deviceToken = await readTrust();
    const r = await api<ApiLoginOk | ApiMfaRequired>("/auth/login", {
      method: "POST",
      body: {
        username: body.data.login,
        password: body.data.password,
        ...(deviceToken && { device_token: deviceToken }),
      },
    });
    if ("mfa_required" in r && r.mfa_required) {
      // Two-step not set up yet (exactly false): core's challenge with an
      // empty code gives the enrolment-only session, and the welcome flow
      // sets it up. Anything else asks for the code: an empty one is never
      // sent for an enrolled account (it would spend one of its attempts).
      if (r.mfa_enrolled === false) {
        const t = await api<ApiLoginOk>("/auth/mfa/challenge", {
          method: "POST",
          body: { mfa_token: r.mfa_token, code: "" },
        });
        return json(200, await startSession(t));
      }
      await writeMfa(r.mfa_token);
      return json(200, { status: "mfa_required" });
    }
    return json(200, await startSession(r as ApiLoginOk));
  } catch (e) {
    const { status, code } = authCode(e, "login");
    return json(status, { code });
  }
}
