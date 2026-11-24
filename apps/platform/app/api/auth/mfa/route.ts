import { z } from "zod";
import { readBackupCode } from "@mhai/api-client/codes";
import type { ApiLoginOk } from "@/lib/api/auth-contract";
import {
  api,
  authCode,
  UpstreamError,
  bodyOf,
  forbidden,
  json,
  sameOrigin,
} from "@/lib/server/http";
import { readMfa, startSession } from "@/lib/server/session";

// No "trust this device" here: any trust field is stripped and never sent.
const Body = z.object({
  code: z.string().trim().min(1).max(20),
  backup: z.boolean(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await bodyOf(req));
  if (!body.success) return json(400, { code: "mfa_invalid" });
  const pending = await readMfa();
  if (!pending) return json(401, { code: "mfa_expired" });
  // A backup code spent at core: its replacement goes to the page in this
  // one no-store reply (a success, a turned-away account, or a refusal after
  // the code was spent), never into a cookie. Anything not in the code's
  // exact shape is dropped.
  let fresh: string | null = null;
  try {
    const r = await api<ApiLoginOk>("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: pending.mfaToken, code: body.data.code },
    });
    if (body.data.backup) fresh = readBackupCode(r.new_backup_code);
    // Any device token in the reply is dropped: startSession reads only the
    // token, its lifetime and the user.
    const out = await startSession(r);
    return json(
      out.status,
      fresh ? { ...out.body, newBackupCode: fresh } : out.body,
    );
  } catch (e) {
    const { status, code } = authCode(e, "mfa");
    if (body.data.backup && e instanceof UpstreamError && e.newBackupCode)
      fresh = e.newBackupCode;
    return json(status, fresh ? { code, newBackupCode: fresh } : { code });
  }
}
