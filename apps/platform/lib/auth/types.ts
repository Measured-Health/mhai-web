// Type-only imports: the server session's shapes are what the routes return.
import type { FirstStep, PlatformUser } from "../server/session";
import type { PlatformRole } from "../server/roles";

export type { FirstStep, PlatformRole };

/** The signed-in Measured Health staff member, as the UI shows them. */
export type User = PlatformUser;

export type SignInResult =
  | {
      status: "signed_in";
      user: User;
      steps: FirstStep[];
      /** Core's new backup code, when a backup code signed in: shown once. */
      newBackupCode?: string;
    }
  | { status: "mfa_required" }
  /**
   * A hospital (clinical) account: it gets no platform session. A backup
   * code spent on the way: core's new one, shown once.
   */
  | { status: "not_platform"; newBackupCode?: string };

export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "locked",
  "mfa_invalid",
  "mfa_expired",
  "mfa_locked",
  "rate_limited",
  "not_platform",
  "weak_password",
  "wrong_password",
  "session_expired",
  "unavailable",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    /** Only when the backend says so; never guessed. */
    readonly attemptsLeft?: number,
    /**
     * A backup code was spent before the refusal: core's new one, to show
     * once (memory only, never logged; the message is only the code).
     */
    readonly newBackupCode?: string,
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export interface Device {
  id: string;
  label: string;
  place: string | null;
  /** Null when the API's time can't be read: the UI hides it. */
  lastActiveAt: number | null;
  current: boolean;
}

export interface MfaSetup {
  otpauthUri: string;
  /** The same secret as text, for "Can't scan?". */
  secret: string;
  /** The account's one backup code, shown once. */
  backupCode: string;
}

/** Who is signed in, and the first sign-in steps they still owe. */
export interface Session {
  user: User;
  steps: FirstStep[];
}

/**
 * The platform sign-in. Unlike the clinical app there is no hospital
 * sign-on, no password reset and no "trust this device": two-step is asked
 * for at every sign-in.
 */
export interface AuthClient {
  getSession(): Promise<Session | null>;
  signIn(login: string, password: string): Promise<SignInResult>;
  verifyCode(code: string, opts: { backup: boolean }): Promise<SignInResult>;
  signOut(): Promise<void>;
  /**
   * Tells the server the person is still here, so its idle clock agrees
   * with the screen's. Rejects with `session_expired` once it has ended.
   */
  keepAlive(): Promise<void>;
  acceptTerms(): Promise<void>;
  /** `current` is the temporary password during first sign-in (core needs it). */
  changePassword(current: string, next: string): Promise<void>;
  startMfaSetup(): Promise<MfaSetup>;
  confirmMfaSetup(code: string): Promise<void>;
  /**
   * Makes a new backup code, confirmed with the person's two-step code or
   * their current backup code (core's step-up); returns it, shown once.
   * The old one stops working. Refusals are `ApiError`s (status and code),
   * like other step-ups.
   */
  regenerateBackupCode(
    code: { mfa_code: string } | { backup_code: string },
    idempotencyKey: string,
  ): Promise<string>;
  listDevices(): Promise<Device[]>;
  signOutDevice(id: string): Promise<void>;
  signOutEverywhere(): Promise<void>;
}

/** Roles from a value that may predate `roles` (be defensive: never crash). */
const rolesOf = (u: User | null | undefined): PlatformRole[] =>
  Array.isArray(u?.roles) ? u.roles : [];

export const isPlatformAdmin = (u: User | null | undefined) =>
  rolesOf(u).includes("platform_admin");

export const isAuditor = (u: User | null | undefined) =>
  rolesOf(u).includes("auditor");

/** Platform admin or auditor: anyone else can't use this app. */
export const hasPlatformRole = (u: User | null | undefined) =>
  isPlatformAdmin(u) || isAuditor(u);
