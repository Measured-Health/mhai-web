import {
  readCappedJson,
  readConfirmBody,
  readIdempotencyKey,
  replaceRefusal,
} from "@mhai/api-client/server/mfa-replace";
import {
  api,
  forbidden,
  json,
  sameOrigin,
  sessionExpired,
} from "@/lib/server/http";
import { readSession, touchSession } from "@/lib/server/session";

/**
 * Finishes moving two-step with a code from the new app. Then the old app
 * stops working and core signs out every remembered device; the backup
 * codes stay the same. (The platform app never remembers a device.)
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const key = readIdempotencyKey(req.headers);
  const body = readConfirmBody(await readCappedJson(req));
  if (!key || !body) return json(422, { code: "invalid" });
  const s = await readSession();
  if (!s) return sessionExpired();
  await touchSession(s);
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
  return json(204);
}
