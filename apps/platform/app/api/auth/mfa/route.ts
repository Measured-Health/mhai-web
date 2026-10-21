import { z } from "zod";
import type { ApiLoginOk } from "@/lib/api/auth-contract";
import {
  api,
  authCode,
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
  try {
    const r = await api<ApiLoginOk>("/auth/mfa/challenge", {
      method: "POST",
      body: { mfa_token: pending.mfaToken, code: body.data.code },
    });
    // Any device token in the reply is dropped: startSession reads only the
    // token, its lifetime and the user.
    const out = await startSession(r);
    return json(out.status, out.body);
  } catch (e) {
    const { status, code } = authCode(e, "mfa");
    return json(status, { code });
  }
}
