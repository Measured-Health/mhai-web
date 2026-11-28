import { z } from "zod";
import { api, UpstreamError } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { platformSignInUrl } from "@/lib/server/platform-url";

const Body = z.object({
  token: z.string().min(1).max(2048),
  next: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "weak_password" });
  let reply: { sign_in?: unknown } | undefined;
  try {
    reply = await api<{ sign_in?: unknown } | undefined>(
      "/auth/password/reset",
      {
        method: "POST",
        body: { token: body.data.token, new_password: body.data.next },
      },
    );
  } catch (e) {
    if (
      e instanceof UpstreamError &&
      (e.code === "invalid_token" || e.code === "token_expired")
    )
      return json(410, { code: "link_expired" });
    if (e instanceof UpstreamError && e.code === "validation_failed")
      return json(422, { code: "weak_password" });
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
  // Core says which app the account signs in to, only after the link
  // worked (so it never tells whether an email has an account). A platform
  // team member's invite opens this page too; their sign-in is the
  // platform admin app's. An older core (204, no body) is the clinical app.
  if (reply?.sign_in === "platform")
    return json(200, { app: "platform", signInUrl: platformSignInUrl() });
  return json(200, { app: "clinical" });
}
