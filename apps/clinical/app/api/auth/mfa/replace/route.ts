import { NEW_BACKUP_CODE_HEADER } from "@mhai/api-client/codes";
import {
  readCappedJson,
  readIdempotencyKey,
  readReplaceReply,
  readStepUpBody,
  replaceRefusal,
} from "@mhai/api-client/server/mfa-replace";
import { api, UpstreamError } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

/**
 * Starts moving two-step to a new authenticator app: the person's current
 * code or a backup code (a step-up) in, the new app's key out. The current
 * app keeps working until confirm. The key is never logged or kept here.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const key = readIdempotencyKey(req.headers);
  const body = readStepUpBody(await readCappedJson(req));
  if (!key || !body) return json(422, { code: "invalid" });
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  // A backup code spent on this start: core's new one goes to the page in
  // this no-store reply's header only (never the body or a cookie), worked
  // or refused, so the person is never left without a code.
  let fresh: string | null = null;
  const carry = (res: Response) => {
    if (fresh) res.headers.set(NEW_BACKUP_CODE_HEADER, fresh);
    return res;
  };
  let reply: unknown;
  try {
    reply = await api<unknown>("/auth/mfa/replace", {
      method: "POST",
      token: s.token,
      body,
      idempotencyKey: key,
      onNewBackupCode: (c) => void (fresh = c),
    });
  } catch (e) {
    const { status, code } = replaceRefusal(e, "start");
    if (e instanceof UpstreamError && e.newBackupCode) fresh = e.newBackupCode;
    return carry(json(status, { code }));
  }
  // Only a reply that reads exactly as the contract says reaches the page.
  const setup = readReplaceReply(reply);
  if (!setup) return carry(json(502, { code: "unavailable" }));
  return carry(json(200, setup));
}
