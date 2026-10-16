import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
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
