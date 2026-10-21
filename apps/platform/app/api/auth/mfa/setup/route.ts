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
    const r = await api<{ otpauth_uri: string; recovery_codes: string[] }>(
      "/auth/mfa/enroll",
      { method: "POST", token: s.token },
    );
    return json(200, {
      otpauthUri: r.otpauth_uri,
      secret: new URL(r.otpauth_uri).searchParams.get("secret") ?? "",
      backupCodes: r.recovery_codes,
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
