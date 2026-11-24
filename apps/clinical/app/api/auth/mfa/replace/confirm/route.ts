import {
  readCappedJson,
  readConfirmBody,
  readIdempotencyKey,
  replaceRefusal,
} from "@mhai/api-client/server/mfa-replace";
import { api } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { forgetTrust, readSession } from "@/lib/server/session";

/**
 * Finishes moving two-step with a code from the new app. Then the old app
 * stops working and core signs out every remembered device, this browser's
 * included; the backup codes stay the same.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const key = readIdempotencyKey(req.headers);
  const body = readConfirmBody(await readCappedJson(req));
  if (!key || !body) return json(422, { code: "invalid" });
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    await api("/auth/mfa/replace/confirm", {
      method: "POST",
      token: s.token,
      body,
      idempotencyKey: key,
    });
  } catch (e) {
    const { status, code } = replaceRefusal(e, "confirm");
    return json(status, { code });
  }
  // Core no longer honours this browser's remembered-device token.
  await forgetTrust();
  return json(204);
}
