import { sealSync, unsealSync } from "@mhai/api-client/server/seal";
import { cookies } from "next/headers";
import type { ApiLoginOk, ApiUser } from "../api/auth-contract";
import { api } from "./http";
import { apiRolesOf, toPlatformRoles, type PlatformRole } from "./roles";

export const SESSION_COOKIE = "mhai_platform_session";
export const MFA_COOKIE = "mhai_platform_mfa";
export const MFA_TTL_S = 300;
/** A session unused for longer than this is over (spec: 15-minute idle limit). */
export const IDLE_LIMIT_MS = 900_000;

export type FirstStep = "password" | "terms" | "mfa";

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  roles: PlatformRole[];
  mfaEnabled: boolean;
  /** Unused backup codes, or null when unknown. */
  backupCodesLeft: number | null;
}

export interface ServerSession {
  token: string;
  expiresAt: number;
  lastSeenAt: number;
  user: PlatformUser;
  steps: FirstStep[];
}

interface MfaPending {
  mfaToken: string;
  expiresAt: number;
}

function secret(): string {
  const s = process.env.PLATFORM_SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error(
      "PLATFORM_SESSION_SECRET must be set to at least 32 characters",
    );
  return s;
}

const seal = (value: unknown): string => sealSync(value, secret());
const unseal = <T>(sealed: string | undefined): T | null =>
  unsealSync<T>(sealed, secret());

/** Host-only (no domain), httpOnly, SameSite=Strict, Secure in production. */
export const cookieOptions = (maxAgeS: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: Math.max(1, Math.floor(maxAgeS)),
});

/** The sealed session as stored, whether or not it has gone idle. */
async function rawSession(): Promise<ServerSession | null> {
  const s = unseal<ServerSession>((await cookies()).get(SESSION_COOKIE)?.value);
  if (
    !s ||
    typeof s.token !== "string" ||
    typeof s.expiresAt !== "number" ||
    typeof s.lastSeenAt !== "number" ||
    !s.user ||
    !Array.isArray(s.user.roles) ||
    !Array.isArray(s.steps)
  )
    return null;
  return s;
}

const live = (s: ServerSession, now: number) =>
  s.expiresAt > now && now - s.lastSeenAt <= IDLE_LIMIT_MS;

/** The session, or null when missing, unreadable, expired or idle too long. */
export async function readSession(
  now = Date.now(),
): Promise<ServerSession | null> {
  const s = await rawSession();
  return s && live(s, now) ? s : null;
}

export async function writeSession(s: ServerSession, now = Date.now()) {
  // The cookie never outlives the token or the idle limit.
  const maxAgeMs = Math.min(s.expiresAt - now, IDLE_LIMIT_MS);
  (await cookies()).set(
    SESSION_COOKIE,
    seal(s),
    cookieOptions(maxAgeMs / 1000),
  );
}

/** Marks the session as used now, and returns it. */
export async function touchSession(
  s: ServerSession,
  now = Date.now(),
): Promise<ServerSession> {
  const next = { ...s, lastSeenAt: now };
  await writeSession(next, now);
  return next;
}

/** Ends the session and any two-step in progress. */
export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_COOKIE);
}

/**
 * Revokes the stored token upstream (best effort, even when idle: the idle
 * token is only ever used to sign itself out), then clears the cookies.
 */
export async function endSession(now = Date.now()) {
  const s = await rawSession().catch(() => null);
  if (s && s.expiresAt > now) await revoke(s.token);
  await clearSession();
}

export const revoke = (token: string) =>
  api("/auth/logout", { method: "POST", token }).then(
    () => undefined,
    () => undefined,
  );

export async function readMfa(now = Date.now()): Promise<MfaPending | null> {
  const m = unseal<MfaPending>((await cookies()).get(MFA_COOKIE)?.value);
  return m && typeof m.mfaToken === "string" && m.expiresAt > now ? m : null;
}

export async function writeMfa(mfaToken: string, now = Date.now()) {
  (await cookies()).set(
    MFA_COOKIE,
    seal({ mfaToken, expiresAt: now + MFA_TTL_S * 1000 }),
    cookieOptions(MFA_TTL_S),
  );
}

export function toPlatformUser(u: ApiUser): PlatformUser {
  return {
    id: u.username,
    email: u.email || u.username,
    name: u.display_name || u.full_name || u.username,
    roles: toPlatformRoles(apiRolesOf(u)),
    mfaEnabled: u.mfa_enabled === true,
    backupCodesLeft: u.recovery_codes_left ?? null,
  };
}

/**
 * First sign-in steps, in order: a new password if required, the terms, then
 * two-step. Two-step is owed whenever the API doesn't say it's on, so it can
 * never be skipped.
 */
export function stepsFor(u: ApiUser): FirstStep[] {
  const steps: FirstStep[] = [];
  if (u.must_change_password) steps.push("password");
  if (u.must_change_password || u.terms_accepted_at === null)
    steps.push("terms");
  if (u.mfa_enabled !== true) steps.push("mfa");
  return steps;
}

export type SignInOutcome =
  | {
      status: 200;
      body: { status: "signed_in"; user: PlatformUser; steps: FirstStep[] };
    }
  | { status: 403; body: { code: "not_platform" } };

/**
 * Seals a fresh token into the session cookie and drops any two-step token.
 * An account with no platform role is signed out upstream at once and gets
 * no session.
 */
export async function startSession(
  r: ApiLoginOk,
  now = Date.now(),
): Promise<SignInOutcome> {
  if (
    typeof r?.access_token !== "string" ||
    !r.access_token ||
    typeof r.expires_in !== "number" ||
    !Number.isFinite(r.expires_in) ||
    r.expires_in <= 0 ||
    !r.user
  )
    throw new Error("Malformed sign-in response");
  const user = toPlatformUser(r.user);
  // A sign-in replaces any earlier platform session in this browser: revoke
  // its token upstream so it can't outlive the cookie that held it.
  const prev = await rawSession().catch(() => null);
  if (prev && prev.token !== r.access_token && prev.expiresAt > now)
    await revoke(prev.token);
  if (user.roles.length === 0) {
    await revoke(r.access_token);
    await clearSession();
    return { status: 403, body: { code: "not_platform" } };
  }
  const s: ServerSession = {
    token: r.access_token,
    expiresAt: now + r.expires_in * 1000,
    lastSeenAt: now,
    user,
    steps: stepsFor(r.user),
  };
  await writeSession(s, now);
  (await cookies()).delete(MFA_COOKIE);
  return {
    status: 200,
    body: { status: "signed_in", user: s.user, steps: s.steps },
  };
}
