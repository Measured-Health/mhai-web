import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
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
  await writeSession({
    ...s,
    user: { ...s.user, mfaEnabled: true },
    steps: s.steps.filter((x) => x !== "mfa"),
  });
  return json(204);
}
