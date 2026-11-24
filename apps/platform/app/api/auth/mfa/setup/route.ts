import { oneBackupCode } from "@mhai/api-client/codes";
import {
  api,
  authCode,
  forbidden,
  json,
  sameOrigin,
  sessionExpired,
} from "@/lib/server/http";
import { readSession, touchSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return sessionExpired();
  await touchSession(s);
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
