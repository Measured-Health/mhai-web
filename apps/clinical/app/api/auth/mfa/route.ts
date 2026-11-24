import { z } from "zod";
import { readBackupCode } from "@mhai/api-client/codes";
import { api, UpstreamError } from "@/lib/server/api";
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
  // A backup code spent at core: its replacement goes to the page in this
  // one no-store reply (a success, or a refusal after the code was spent),
  // never into a cookie. Anything not in the code's exact shape is dropped.
  let fresh: string | null = null;
  try {
    const r = await api<ApiLoginOk & ApiDeviceToken>("/auth/mfa/challenge", {
      method: "POST",
      body: {
        mfa_token: pending.mfaToken,
        code: body.data.code,
        trust_device: body.data.trustDevice,
      },
    });
    if (body.data.backup) fresh = readBackupCode(r.new_backup_code);
    if (r.device_token) await writeTrust(r.device_token);
    const out = await startSession(r);
    return json(200, fresh ? { ...out, newBackupCode: fresh } : out);
  } catch (e) {
    const { status, code } = authCode(e, "mfa");
    if (body.data.backup && e instanceof UpstreamError && e.newBackupCode)
      fresh = e.newBackupCode;
    return json(status, fresh ? { code, newBackupCode: fresh } : { code });
  }
}
