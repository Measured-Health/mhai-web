import { api } from "@/lib/server/api";
import { TERMS_VERSION } from "@/lib/auth/terms";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { UpstreamError } from "@/lib/server/api";
import { refreshSession } from "@/lib/server/refresh";
import { readSession, writeSession } from "@/lib/server/session";

/** Records acceptance upstream, then drops the terms step. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  let s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  const accept = (token: string) =>
    api("/auth/terms", {
      method: "POST",
      token,
      body: { version: TERMS_VERSION },
    });
  try {
    try {
      await accept(s.token);
    } catch (e) {
      // Core takes the terms only from a full session: after two-step was
      // just set up, the next refresh mints one. Refresh, then try once more.
      if (!(e instanceof UpstreamError && e.code === "mfa_required")) throw e;
      const fresh = await refreshSession(s);
      if (fresh.token === s.token) throw e;
      s = fresh;
      await accept(s.token);
    }
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  await writeSession({ ...s, steps: s.steps.filter((x) => x !== "terms") });
  return json(204);
}
