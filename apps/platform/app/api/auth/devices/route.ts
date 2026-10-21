import type { ApiSession } from "@/lib/api/auth-contract";
import { api, authCode, json, sessionExpired } from "@/lib/server/http";
import { readSession } from "@/lib/server/session";

interface Device {
  id: string;
  label: string;
  place: string | null;
  /** Null when the API's time can't be read: the UI hides it. */
  lastActiveAt: number | null;
  current: boolean;
}

function toDevice(s: ApiSession): Device {
  const seen = Date.parse(s.last_seen_at);
  return {
    id: s.id,
    label: s.device,
    place: s.location ?? null,
    lastActiveAt: Number.isFinite(seen) ? seen : null,
    current: s.current,
  };
}

export async function GET() {
  const s = await readSession();
  if (!s) return sessionExpired();
  try {
    const r = await api<ApiSession[]>("/auth/sessions", { token: s.token });
    return json(200, r.map(toDevice));
  } catch (e) {
    const { status, code } = authCode(e, "other");
    return json(status, { code });
  }
}
