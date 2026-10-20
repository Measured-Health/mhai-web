import { sealSync, unsealSync } from "@mhai/api-client/server/seal";
import { cookies } from "next/headers";
import type { FirstStep, Role, SignInResult, User } from "../auth/types";
import { stepsFor, toUser, type ApiLoginOk } from "./map-user";

export const SESSION_COOKIE = "mhai_session";
export const MFA_COOKIE = "mhai_mfa";
export const MFA_TTL_S = 300;
export const TRUST_COOKIE = "mhai_trusted";
export const TRUST_TTL_S = 30 * 86_400;

export interface ServerSession {
  token: string;
  expiresAt: number;
  user: User;
  steps: FirstStep[];
}
interface MfaPending {
  mfaToken: string;
  expiresAt: number;
}

function secret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return secret;
}

export const seal = (value: unknown): string => sealSync(value, secret());

export const unseal = <T>(sealed: string | undefined): T | null =>
  unsealSync<T>(sealed, secret());

export const cookieOptions = (maxAgeS: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: Math.max(1, Math.floor(maxAgeS)),
});

export async function readSession(
  now = Date.now(),
): Promise<ServerSession | null> {
  const s = unseal<ServerSession & { user: { role?: Role } }>(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!s || s.expiresAt <= now) return null;
  // Sealed before roles combined (Plan 4): one `role`.
  if (!Array.isArray(s.user.roles))
    s.user = { ...s.user, roles: s.user.role ? [s.user.role] : [] };
  return s;
}

export async function writeSession(s: ServerSession, now = Date.now()) {
  (await cookies()).set(
    SESSION_COOKIE,
    seal(s),
    cookieOptions((s.expiresAt - now) / 1000),
  );
}

/** Ends the session and any MFA step. The trusted-device cookie stays. */
export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
}

export async function readMfa(now = Date.now()): Promise<MfaPending | null> {
  const m = unseal<MfaPending>((await cookies()).get(MFA_COOKIE)?.value);
  return m && m.expiresAt > now ? m : null;
}

export async function writeMfa(mfaToken: string, now = Date.now()) {
  (await cookies()).set(
    MFA_COOKIE,
    seal({ mfaToken, expiresAt: now + MFA_TTL_S * 1000 }),
    cookieOptions(MFA_TTL_S),
  );
}

export async function readTrust(): Promise<string | null> {
  const t = unseal<{ deviceToken?: unknown }>(
    (await cookies()).get(TRUST_COOKIE)?.value,
  );
  return typeof t?.deviceToken === "string" ? t.deviceToken : null;
}

export async function writeTrust(deviceToken: string) {
  (await cookies()).set(
    TRUST_COOKIE,
    seal({ deviceToken }),
    cookieOptions(TRUST_TTL_S),
  );
}

/** Seals a fresh API token into the session cookie and drops any MFA step. */
export async function startSession(
  r: ApiLoginOk,
  now = Date.now(),
): Promise<Extract<SignInResult, { status: "signed_in" }>> {
  const s: ServerSession = {
    token: r.access_token,
    expiresAt: now + r.expires_in * 1000,
    user: toUser(r.user),
    steps: stepsFor(r.user),
  };
  await writeSession(s, now);
  (await cookies()).delete(MFA_COOKIE);
  return { status: "signed_in", user: s.user, steps: s.steps };
}
