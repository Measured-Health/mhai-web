import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { refreshOnce, signedOutMeanwhile } from "@/lib/server/refresh";
import { readSession, writeSession } from "@/lib/server/session";

const Body = z.object({ code: z.string().trim().min(1).max(20) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "mfa_invalid" });
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
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
  // Verify only marks this session as proven by a code; the next refresh
  // mints a full token (an enrolment-only one reaches nothing else). If the
  // refresh fails, the terms step refreshes again before it gives up.
  const fresh = s.refreshToken ? await refreshOnce(s.refreshToken) : null;
  // Signed out while this was running: no session to update.
  if (signedOutMeanwhile(s)) return json(401, { code: "session_expired" });
  await writeSession({
    ...s,
    ...(fresh ?? {}),
    user: { ...s.user, mfaEnabled: true },
    steps: s.steps.filter((x) => x !== "mfa"),
  });
  return json(204);
}
