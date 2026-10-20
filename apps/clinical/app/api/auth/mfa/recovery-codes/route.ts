import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    const r = await api<{ recovery_codes: string[] }>(
      "/auth/mfa/recovery-codes",
      { method: "POST", token: s.token },
    );
    await writeSession({
      ...s,
      user: { ...s.user, backupCodesLeft: r.recovery_codes.length },
    });
    return json(200, { backupCodes: r.recovery_codes });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
