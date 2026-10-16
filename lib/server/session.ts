import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";
import type { FirstStep, SignInResult, User } from "../auth/types";
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

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    c.update(JSON.stringify(value), "utf8"),
    c.final(),
  ]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined): T | null {
  const k = key(); // outside the try: a missing secret must throw
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    // 12 IV + 16 tag + at least 1 byte of ciphertext.
    if (raw.length < 29) return null;
    const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12), {
      authTagLength: 16,
    });
    d.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([
      d.update(raw.subarray(28)),
      d.final(),
    ]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

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
  const s = unseal<ServerSession>((await cookies()).get(SESSION_COOKIE)?.value);
  return s && s.expiresAt > now ? s : null;
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
