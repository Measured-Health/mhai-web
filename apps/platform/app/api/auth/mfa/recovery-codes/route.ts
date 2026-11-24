import {
  readRecoveryReply,
  recoveryRefusal,
} from "@mhai/api-client/server/backup-code";
import {
  readCappedJson,
  readIdempotencyKey,
  readStepUpBody,
} from "@mhai/api-client/server/mfa-replace";
import { NEW_BACKUP_CODE_HEADER } from "@mhai/api-client/codes";
import {
  api,
  forbidden,
  json,
  sameOrigin,
  sessionExpired,
  UpstreamError,
} from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

/**
 * A new backup code (core's step-up: the two-step code or the current
 * backup code, exactly one). The old one stops working; the new one goes
 * to the page in this no-store reply only, never into the session cookie.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return sessionExpired();
  const key = readIdempotencyKey(req.headers);
  const body = readStepUpBody(await readCappedJson(req));
  if (!key || !body) return json(422, { code: "invalid" });
  let reply: unknown;
  try {
    reply = await api<unknown>("/auth/mfa/recovery-codes", {
      method: "POST",
      token: s.token,
      body,
      idempotencyKey: key,
    });
  } catch (e) {
    const { status, code } = recoveryRefusal(e);
    const res = json(status, { code });
    // Refused after core spent the backup code: its new one still goes on.
    if (e instanceof UpstreamError && e.newBackupCode)
      res.headers.set(NEW_BACKUP_CODE_HEADER, e.newBackupCode);
    return res;
  }
  // Exactly one code in its exact shape. Core has already replaced the old
  // one, so anything else leaves none to use: the Account page then offers
  // to make one again.
  const backupCode = readRecoveryReply(reply);
  await writeSession({
    ...s,
    lastSeenAt: Date.now(),
    user: { ...s.user, backupCodesLeft: backupCode ? 1 : 0 },
  });
  if (!backupCode) return json(502, { code: "unavailable" });
  return json(200, { backupCode });
}
