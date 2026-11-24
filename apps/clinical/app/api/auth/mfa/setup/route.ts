import { oneBackupCode } from "@mhai/api-client/codes";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    const r = await api<{ otpauth_uri: string; recovery_codes: unknown }>(
      "/auth/mfa/enroll",
      { method: "POST", token: s.token },
    );
    // One backup code per account: exactly one, in its exact shape, or
    // nothing reaches the page.
    const backupCode = oneBackupCode(r.recovery_codes);
    if (!backupCode) return json(502, { code: "unavailable" });
    return json(200, {
      otpauthUri: r.otpauth_uri,
      secret: new URL(r.otpauth_uri).searchParams.get("secret") ?? "",
      backupCode,
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
