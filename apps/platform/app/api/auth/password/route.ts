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

const Body = z.object({
  current: z.string().max(1024).nullable(),
  next: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const body = Body.safeParse(await bodyOf(req));
  if (!body.success) return json(400, { code: "weak_password" });
  const s = await readSession();
  if (!s) return sessionExpired();
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
  await writeSession({
    ...s,
    lastSeenAt: Date.now(),
    steps: s.steps.filter((x) => x !== "password"),
  });
  return json(204);
}
