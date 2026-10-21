import { z } from "zod";
import {
  api,
  authCode,
  bodyOf,
  forbidden,
  json,
  sameOrigin,
  sessionExpired,
} from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

const Body = z.object({ code: z.string().trim().min(1).max(20) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await bodyOf(req));
  if (!body.success) return json(400, { code: "mfa_invalid" });
  const s = await readSession();
  if (!s) return sessionExpired();
  try {
    await api("/auth/mfa/verify", {
      method: "POST",
      token: s.token,
      body: { code: body.data.code },
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  await writeSession({
    ...s,
    lastSeenAt: Date.now(),
    user: { ...s.user, mfaEnabled: true },
    steps: s.steps.filter((x) => x !== "mfa"),
  });
  return json(204);
}
