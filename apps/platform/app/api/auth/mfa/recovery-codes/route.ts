import {
  api,
  authCode,
  forbidden,
  json,
  sameOrigin,
  sessionExpired,
} from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return sessionExpired();
  try {
    const r = await api<{ recovery_codes: string[] }>(
      "/auth/mfa/recovery-codes",
      { method: "POST", token: s.token },
    );
    await writeSession({
      ...s,
      lastSeenAt: Date.now(),
      user: { ...s.user, backupCodesLeft: r.recovery_codes.length },
    });
    return json(200, { backupCodes: r.recovery_codes });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
