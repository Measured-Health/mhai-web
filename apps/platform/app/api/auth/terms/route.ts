import { TERMS_VERSION } from "@/lib/auth/terms";
import {
  api,
  authCode,
  forbidden,
  json,
  sameOrigin,
  sessionExpired,
} from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

/** Records acceptance upstream (assumed contract), then drops the terms step. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (!s) return sessionExpired();
  try {
    await api("/auth/terms", {
      method: "POST",
      token: s.token,
      body: { version: TERMS_VERSION },
    });
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  await writeSession({
    ...s,
    lastSeenAt: Date.now(),
    steps: s.steps.filter((x) => x !== "terms"),
  });
  return json(204);
}
