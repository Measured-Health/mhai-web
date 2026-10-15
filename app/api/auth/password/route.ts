import { z } from "zod";
import { api } from "@/lib/server/api";
import { authCode, forbidden, json, sameOrigin } from "@/lib/server/http";
import { readSession, writeSession } from "@/lib/server/session";

const Body = z.object({
  current: z.string().max(1024).nullable(),
  next: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return json(400, { code: "weak_password" });
  const s = await readSession();
  if (!s) return json(401, { code: "session_expired" });
  try {
    // Field names are an assumption until the backend's openapi.json lands.
    await api("/auth/password", {
      method: "POST",
      token: s.token,
      body: {
        current_password: body.data.current,
        new_password: body.data.next,
      },
    });
  } catch (e) {
    const { status, code } = authCode(
      e,
      body.data.current === null ? "other" : "current",
    );
    return json(status, { code });
  }
  await writeSession({ ...s, steps: s.steps.filter((x) => x !== "password") });
  return json(204);
}
