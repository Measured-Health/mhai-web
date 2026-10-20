import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import type { ApiDeviceToken } from "@/lib/api/auth-contract";
import type { ApiLoginOk } from "@/lib/server/map-user";
import { readMfa, startSession, writeTrust } from "@/lib/server/session";

const Body = z.object({
  code: z.string().trim().min(1).max(20),
  backup: z.boolean(),
  // Sent upstream as trust_device (assumed contract; backend §10 item 7).
  trustDevice: z.boolean(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "mfa_invalid" });
  const pending = await readMfa();
  if (!pending) return json(401, { code: "mfa_expired" });
  try {
    const r = await api<ApiLoginOk & ApiDeviceToken>("/auth/mfa/challenge", {
      method: "POST",
      body: {
        mfa_token: pending.mfaToken,
        code: body.data.code,
        trust_device: body.data.trustDevice,
      },
    });
    if (r.device_token) await writeTrust(r.device_token);
    return json(200, await startSession(r));
  } catch (e) {
    const { status, code } = authCode(e, "mfa");
    return json(status, { code });
  }
}
