export type Role =
  | "clinician"
  | "hospital_admin"
  | "admin"
  | "auditor"
  | "researcher"
  | "analyst";

/** The signed-in person, as the UI shows them. Fields the API doesn't have yet are null. */
export interface User {
  username: string;
  email: string | null;
  /** Short name for the sidebar and greetings, e.g. "Dr. Reyes". */
  displayName: string;
  fullName: string | null;
  /** Every role the person holds. Clinician and hospital admin combine (R1). */
  roles: Role[];
  /** Job title from hospital records, e.g. "Attending physician". */
  roleTitle: string | null;
  specialty: string | null;
  hospital: string | null;
  mfaEnabled: boolean;
  /** Unused backup codes, or null when unknown. */
  backupCodesLeft: number | null;
  /** Switches the API turned on for this person. Absent means off. */
  features?: { analysis: boolean };
}

/** First sign-in steps still to do, in this order. */
export type FirstStep = "terms" | "password" | "mfa";

export type SignInResult =
  | { status: "signed_in"; user: User; steps: FirstStep[] }
  | { status: "mfa_required" };

/** What the current backend supports. The UI hides anything that's false. */
export interface Capabilities {
  /** "Continue with hospital account" (single sign-on). */
  sso: boolean;
  /** Sign in with a work email (otherwise a username). */
  emailLogin: boolean;
  passwordReset: boolean;
  /** Active devices, sign out one, sign out everywhere. */
  devices: boolean;
  trustDevice: boolean;
}

export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "locked",
  "mfa_invalid",
  "mfa_expired",
  "rate_limited",
  "weak_password",
  "wrong_password",
  "link_expired",
  "session_expired",
  "sso_failed",
  "unavailable",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    /** Only when the backend says so; never guessed. */
    readonly attemptsLeft?: number,
  ) {
    super(code);
    this.name = "AuthError";
  }
}

export interface Device {
  id: string;
  /** e.g. "Chrome on Windows · Ward 4 PC" */
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
  /** Ten one-time codes, shown once. */
  backupCodes: string[];
}

/** Who is signed in, and the first sign-in steps they still owe. */
export interface Session {
  user: User;
  steps: FirstStep[];
}

export interface AuthClient {
  readonly capabilities: Capabilities;
  getSession(): Promise<Session | null>;
  signIn(login: string, password: string): Promise<SignInResult>;
  signInWithHospital(): Promise<SignInResult>;
  verifyCode(
    code: string,
    opts: { backup: boolean; trustDevice: boolean },
  ): Promise<SignInResult>;
  /** Finishes hospital sign-on with the one-time code from the return URL. */
  completeHospitalSignIn(code: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  acceptTerms(): Promise<void>;
  /** `current` is null during first sign-in (temporary password). */
  changePassword(current: string | null, next: string): Promise<void>;
  startMfaSetup(): Promise<MfaSetup>;
  confirmMfaSetup(code: string): Promise<void>;
  /** Replaces all backup codes; returns the new ones (shown once). */
  regenerateBackupCodes(): Promise<string[]>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, next: string): Promise<void>;
  listDevices(): Promise<Device[]>;
  signOutDevice(id: string): Promise<void>;
  signOutEverywhere(): Promise<void>;
}

/** Measured Health's own staff: they use the platform admin app, never this one. */
const PLATFORM_ROLES: readonly Role[] = ["admin", "auditor"];

/** Roles from a value that may predate `roles` (be defensive: never crash). */
const rolesOf = (u: User | null): Role[] =>
  Array.isArray(u?.roles) ? u.roles : [];

export const isPlatformAccount = (u: User | null) =>
  rolesOf(u).some((r) => PLATFORM_ROLES.includes(r));

/** The clinical side: a clinician who isn't a platform account (R1). */
export const isClinical = (u: User | null) =>
  !isPlatformAccount(u) && rolesOf(u).includes("clinician");

/** The hospital admin side (spec §5.6). */
export const isHospitalAdmin = (u: User | null) =>
  !isPlatformAccount(u) && rolesOf(u).includes("hospital_admin");

/** A hospital admin who isn't a clinician: no clinical screens at all (R3). */
export const isAdminOnly = (u: User | null) =>
  isHospitalAdmin(u) && !isClinical(u);

/** Whether the Analysis switch is on for this person (absent means off). */
export const analysisOn = (u: User | null) => u?.features?.analysis === true;

/**
 * Analysis: a hospital admin, or a clinician who holds the analyst role,
 * when the switch is on. Never a platform account.
 */
export const canUseAnalysis = (u: User | null) =>
  !isPlatformAccount(u) &&
  analysisOn(u) &&
  (isHospitalAdmin(u) || (isClinical(u) && rolesOf(u).includes("analyst")));

export type Area = "clinical" | "admin" | "analysis";

export const canUse = (u: User | null, area: Area) =>
  area === "clinical"
    ? isClinical(u)
    : area === "admin"
      ? isHospitalAdmin(u)
      : canUseAnalysis(u);

/** The hospital admin side's first screen (R2). */
export const ADMIN_HOME = "/admin/staff";

/** "Dr. Reyes" → "DR"; "Ana Maria Reyes" → "AM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
