import { api } from "@/lib/server/api";
import { forbidden, json, sameOrigin } from "@/lib/server/http";
import { clearSession, readSession } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const s = await readSession();
  if (s)
    await api("/auth/logout", { method: "POST", token: s.token }).catch(
      () => {},
    );
  await clearSession();
  return json(204);
}
