import { normalizeBackupCode } from "@mhai/api-client/codes";
import { ApiError } from "@mhai/api-client/errors";
import { base32Encode, verifyTotp } from "@mhai/api-client/totp";
import {
  AuthError,
  type AuthClient,
  type Device,
  type FirstStep,
  type Role,
  type SignInResult,
  type User,
} from "./types";

export const MOCK_CODE = "123456";
export const MOCK_RESET_TOKEN = "demo";
export const MOCK_BACKUP_CODES = [
  "4F7K-92QX",
  "M8TD-31LP",
  "Z2HV-7R6C",
  "Q9WE-5N4B",
  "K3YU-8J2D",
  "P6RA-1T9M",
  "B5NC-4X7H",
  "W1GZ-6E3V",
  "D8LS-2K5Q",
  "H7MF-9P1Y",
];
export const MOCK_SSO_CODE = "demo-sso";
export const MOCK_NEW_BACKUP_CODES = MOCK_BACKUP_CODES.map((c) =>
  c.split("").reverse().join(""),
);

/** The demo's authenticator secret: scan the QR code and real app codes work too. */
export const MOCK_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
/** The demo's "new app" key when two-step moves to another app. */
export const MOCK_NEW_TOTP_SECRET = base32Encode("mhai-demo-new-app");
const LOCK_MS = 15 * 60_000;
const MAX_TRIES = 5;
/** How long a move to a new app waits for its first code (core: 15 minutes). */
export const REPLACE_MS = 15 * 60_000;

export type StepUpResult = "ok" | "invalid" | "locked";

/**
 * The demo's two-step codes, shared by sign-in and by removing staff, so a
 * backup code spent in one place is spent everywhere, and regenerated codes
 * replace the old ones. Wrong tries are counted per person and lock for a while.
 */
export interface StepUp {
  /** A current code from the app (or the demo code); `secret`: another app's key. */
  digitsOk(code: string, secret?: string): Promise<boolean>;
  /** Uses up a backup code if it is current; false if not. */
  takeBackup(code: string): boolean;
  setBackupCodes(codes: string[]): void;
  /** Moves two-step to another app's key: the old app's codes stop working. */
  setSecret(secret: string): void;
  /** Called after a backup code is used. */
  onBackupSpent?: () => void;
  /**
   * Checks a code for `email`, counting wrong tries; locks after five.
   * `secret` checks a code from another app (a new one being added).
   */
  check(
    email: string | null,
    auth: { mfaCode: string } | { backupCode: string },
    secret?: string,
  ): Promise<StepUpResult>;
}

export function createStepUp(now: () => number = () => Date.now()): StepUp {
  let backupLeft = new Set(MOCK_BACKUP_CODES);
  let appSecret = MOCK_TOTP_SECRET;
  const failures = new Map<string, number>();
  const lockedUntil = new Map<string, number>();
  const self: StepUp = {
    async digitsOk(code, secret = appSecret) {
      const digits = code.replace(/\s/g, "");
      return digits === MOCK_CODE || (await verifyTotp(secret, digits, now()));
    },
    setSecret(secret) {
      appSecret = secret;
    },
    takeBackup(code) {
      const c = normalizeBackupCode(code);
      if (!backupLeft.delete(c)) return false;
      self.onBackupSpent?.();
      return true;
    },
    setBackupCodes(codes) {
      backupLeft = new Set(codes);
    },
    async check(email, auth, secret) {
      const key = email?.toLowerCase() ?? "";
      if ((lockedUntil.get(key) ?? 0) > now()) return "locked";
      const ok =
        "backupCode" in auth
          ? self.takeBackup(auth.backupCode)
          : await self.digitsOk(auth.mfaCode, secret);
      if (ok) {
        failures.delete(key);
        return "ok";
      }
      const n = (failures.get(key) ?? 0) + 1;
      if (n >= MAX_TRIES) {
        failures.delete(key);
        lockedUntil.set(key, now() + LOCK_MS);
      } else failures.set(key, n);
      return "invalid";
    },
  };
  return self;
}

let demoStepUp = createStepUp();
/** The codes the running demo's sign-in uses; the sample hospital checks the same. */
export const getDemoStepUp = (): StepUp => demoStepUp;

const trigger = (login: string) =>
  login
    .toLowerCase()
    .split("@")[0]!
    .split(/[._+-]/)[0] ?? "";

/** The demo's sample logins. Task 3's sample hospital lists the two admins. */
export const DEMO_EMAILS = {
  clinician: "a.reyes@pilot-hospital.example",
  twoStep: "mfa.okafor@pilot-hospital.example",
  newAccount: "new.bello@pilot-hospital.example",
  newAdmin: "newadmin.okoro@pilot-hospital.example",
  hospitalAdmin: "admin.nwosu@pilot-hospital.example",
  director: "director.obi@pilot-hospital.example",
  platformAdmin: "platform.bakare@measured-health.example",
  locked: "locked.eze@pilot-hospital.example",
  analyst: "analyst.adeyemi@pilot-hospital.example",
} as const;

/** Sample accounts for the demo's sign-in page. Any other email works too. */
export const SAMPLE_ACCOUNTS = [
  {
    email: DEMO_EMAILS.clinician,
    label: "Clinician",
    note: "Signs straight in",
  },
  {
    email: DEMO_EMAILS.twoStep,
    label: "Clinician with two-step",
    note: "Code 123456",
  },
  {
    email: DEMO_EMAILS.newAccount,
    label: "New account",
    note: "First sign-in steps",
  },
  {
    email: DEMO_EMAILS.newAdmin,
    label: "New hospital admin",
    note: "First sign-in steps",
  },
  {
    email: DEMO_EMAILS.hospitalAdmin,
    label: "Hospital admin",
    note: "Staff, settings and usage; no clinical screens",
  },
  {
    email: DEMO_EMAILS.director,
    label: "Medical director",
    note: "Clinician and hospital admin",
  },
  {
    email: DEMO_EMAILS.analyst,
    label: "Analyst",
    note: "Clinician with Analysis",
  },
  {
    email: DEMO_EMAILS.platformAdmin,
    label: "Platform admin",
    note: "Shows the 403 page",
  },
  {
    email: DEMO_EMAILS.locked,
    label: "Locked account",
    note: "Shows the lock",
  },
] as const;

const PEOPLE: Record<
  string,
  Pick<User, "displayName" | "fullName" | "roleTitle" | "specialty">
> = {
  mfa: {
    displayName: "Dr. Okafor",
    fullName: "Dr. Chidi Okafor",
    roleTitle: "Consultant",
    specialty: "Paediatrics",
  },
  new: {
    displayName: "Nurse Bello",
    fullName: "Amina Bello",
    roleTitle: "Staff nurse",
    specialty: "General ward",
  },
  admin: {
    displayName: "Grace Nwosu",
    fullName: "Grace Nwosu",
    roleTitle: "Hospital IT lead",
    specialty: null,
  },
  newadmin: {
    displayName: "Chike Okoro",
    fullName: "Chike Okoro",
    roleTitle: "Hospital IT lead",
    specialty: null,
  },
  director: {
    displayName: "Dr. Obi",
    fullName: "Dr. Ngozi Obi",
    roleTitle: "Medical director",
    specialty: "Emergency medicine",
  },
  platform: {
    displayName: "Tunde Bakare",
    fullName: "Tunde Bakare",
    roleTitle: "Platform admin",
    specialty: null,
  },
  analyst: {
    displayName: "Dr. Adeyemi",
    fullName: "Dr. Kemi Adeyemi",
    roleTitle: "Consultant physician",
    specialty: "Internal Medicine",
  },
  auditor: {
    displayName: "Femi Adebayo",
    fullName: "Femi Adebayo",
    roleTitle: "Auditor",
    specialty: null,
  },
};
const REYES = {
  displayName: "Dr. Reyes",
  fullName: "Dr. Ana Reyes",
  roleTitle: "Attending physician",
  specialty: "Internal Medicine",
};

/** The first word of the login picks the roles (memory-only demo). */
const ROLES_FOR: Record<string, Role[]> = {
  admin: ["hospital_admin"],
  newadmin: ["hospital_admin"],
  director: ["clinician", "hospital_admin"],
  analyst: ["clinician", "analyst"],
  platform: ["admin"],
  auditor: ["auditor"],
};

function userFor(login: string, roles: Role[], mfaEnabled: boolean): User {
  return {
    username: login.split("@")[0]!,
    email: login.includes("@") ? login : null,
    ...(PEOPLE[trigger(login)] ?? REYES),
    roles: [...roles],
    hospital: "Pilot Hospital",
    mfaEnabled,
    backupCodesLeft: mfaEnabled ? 8 : null,
    // The demo has Analysis and named access on for everyone (live mode is
    // gated on the server).
    features: { analysis: true, named: true },
  };
}

/** The demo's sign-in: memory only (a reload signs you out), never stored. */
export function createMockAuthClient({
  now = () => Date.now(),
  stepUp,
}: { now?: () => number; stepUp?: StepUp } = {}): AuthClient {
  const codes = (stepUp ??= demoStepUp = createStepUp(now));
  let session: User | null = null;
  let steps: FirstStep[] = [];
  let pending: User | null = null;
  const failures = new Map<string, number>();
  const lockedUntil = new Map<string, number>();
  let devices: Device[] = [];
  /** A move to a new app waiting for its first code (memory only). */
  let replacing: { secret: string; at: number } | null = null;

  const startSession = (u: User, owed: FirstStep[] = []): void => {
    session = u;
    replacing = null;
    steps = owed;
    devices = [
      {
        id: "this",
        label: "Chrome on Windows · Ward 4 PC",
        place: "Lagos",
        lastActiveAt: now(),
        current: true,
      },
      {
        id: "phone",
        label: "Safari on iPhone",
        place: "Lagos",
        lastActiveAt: now() - 2 * 3_600_000,
        current: false,
      },
    ];
  };
  const requireSession = () => {
    if (!session) throw new AuthError("session_expired");
    return session;
  };
  const strong = (pw: string) => {
    if (pw.length < 12) throw new AuthError("weak_password");
  };
  const codeOk = (code: string) => codes.digitsOk(code);
  codes.onBackupSpent = () => {
    if (session)
      session = {
        ...session,
        backupCodesLeft: Math.max(0, (session.backupCodesLeft ?? 0) - 1),
      };
  };
  const done = (step: FirstStep) => {
    steps = steps.filter((s) => s !== step);
  };

  return {
    capabilities: {
      sso: true,
      emailLogin: true,
      passwordReset: true,
      devices: true,
      trustDevice: true,
    },

    async getSession() {
      return session ? { user: session, steps: [...steps] } : null;
    },

    async signIn(login, password): Promise<SignInResult> {
      const key = login.trim().toLowerCase();
      if ((lockedUntil.get(key) ?? 0) > now()) throw new AuthError("locked");
      const word = trigger(key);
      if (word === "locked") throw new AuthError("locked");
      if (password === "wrong") {
        const n = (failures.get(key) ?? 0) + 1;
        failures.set(key, n);
        if (n >= MAX_TRIES) {
          failures.delete(key);
          lockedUntil.set(key, now() + LOCK_MS);
          throw new AuthError("locked");
        }
        throw new AuthError("invalid_credentials", MAX_TRIES - n);
      }
      failures.delete(key);
      if (word === "mfa") {
        pending = userFor(key, ["clinician"], true);
        return { status: "mfa_required" };
      }
      if (word === "new" || word === "newadmin") {
        const u = userFor(key, ROLES_FOR[word] ?? ["clinician"], false);
        // Core's order: password and two-step first, then the terms.
        const owed: FirstStep[] = ["password", "mfa", "terms"];
        startSession(u, owed);
        return { status: "signed_in", user: u, steps: [...owed] };
      }
      const u = userFor(key, ROLES_FOR[word] ?? ["clinician"], true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signInWithHospital() {
      const u = userFor("a.reyes@pilot-hospital.example", ["clinician"], true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async verifyCode(code, { backup }) {
      if (!pending) throw new AuthError("mfa_expired");
      if (backup) {
        if (!codes.takeBackup(code)) throw new AuthError("mfa_invalid");
      } else if (!(await codeOk(code))) {
        throw new AuthError("mfa_invalid");
      }
      const u = backup
        ? {
            ...pending,
            backupCodesLeft: Math.max(0, (pending.backupCodesLeft ?? 0) - 1),
          }
        : pending;
      pending = null;
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async completeHospitalSignIn(code) {
      if (code !== MOCK_SSO_CODE) throw new AuthError("sso_failed");
      const u = userFor("a.reyes@pilot-hospital.example", ["clinician"], true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signOut() {
      session = null;
      steps = [];
      pending = null;
      replacing = null;
    },

    async acceptTerms() {
      requireSession();
      done("terms");
    },

    async changePassword(current, next) {
      requireSession();
      if (current === "wrong") throw new AuthError("wrong_password");
      strong(next);
      done("password");
    },

    async startMfaSetup() {
      const u = requireSession();
      codes.setBackupCodes(MOCK_BACKUP_CODES);
      codes.setSecret(MOCK_TOTP_SECRET);
      return {
        // Authenticator apps list it as "MHAI Demo" over the email, so the
        // shared demo key is never mistaken for a real MHAI account.
        otpauthUri: `otpauth://totp/${encodeURIComponent("MHAI Demo")}:${encodeURIComponent(u.email ?? u.username)}?secret=${MOCK_TOTP_SECRET}&issuer=${encodeURIComponent("MHAI Demo")}&algorithm=SHA1&digits=6&period=30`,
        secret: MOCK_TOTP_SECRET,
        backupCodes: [...MOCK_BACKUP_CODES],
      };
    },

    async confirmMfaSetup(code) {
      const u = requireSession();
      if (!(await codeOk(code))) throw new AuthError("mfa_invalid");
      session = { ...u, mfaEnabled: true, backupCodesLeft: 10 };
      done("mfa");
    },

    async regenerateBackupCodes() {
      const u = requireSession();
      codes.setBackupCodes(MOCK_NEW_BACKUP_CODES);
      session = { ...u, backupCodesLeft: 10 };
      return [...MOCK_NEW_BACKUP_CODES];
    },

    // Core's rules: a step-up starts it, the current app works until the
    // new app's code confirms it (within 15 minutes), the backup codes stay.
    async startMfaReplace(code) {
      const u = session;
      if (!u) throw new ApiError(401, "session_expired");
      if (!u.mfaEnabled) throw new ApiError(403, "mfa_required");
      const r = await codes.check(
        u.email,
        "backup_code" in code
          ? { backupCode: code.backup_code }
          : { mfaCode: code.mfa_code },
      );
      if (r === "locked") throw new ApiError(429, "mfa_locked");
      if (r === "invalid") throw new ApiError(403, "mfa_invalid");
      replacing = { secret: MOCK_NEW_TOTP_SECRET, at: now() };
      const label = encodeURIComponent("MHAI Demo");
      return {
        otpauthUri: `otpauth://totp/${label}:${encodeURIComponent(u.email ?? u.username)}?secret=${MOCK_NEW_TOTP_SECRET}&issuer=${label}&algorithm=SHA1&digits=6&period=30`,
        secret: MOCK_NEW_TOTP_SECRET,
      };
    },

    async confirmMfaReplace(code) {
      const u = session;
      if (!u) throw new ApiError(401, "session_expired");
      const waiting = replacing;
      if (!waiting || now() - waiting.at > REPLACE_MS) {
        replacing = null;
        throw new ApiError(409, "conflict");
      }
      const r = await codes.check(u.email, { mfaCode: code }, waiting.secret);
      if (r === "locked") throw new ApiError(429, "mfa_locked");
      if (r === "invalid") throw new ApiError(403, "mfa_invalid");
      codes.setSecret(waiting.secret);
      replacing = null;
    },

    async requestPasswordReset() {
      // Same reply whether or not the email exists.
    },

    async resetPassword(token, next) {
      if (token !== MOCK_RESET_TOKEN) throw new AuthError("link_expired");
      strong(next);
    },

    async listDevices() {
      requireSession();
      return devices;
    },

    async signOutDevice(id) {
      requireSession();
      devices = devices.filter((d) => d.current || d.id !== id);
    },

    async signOutEverywhere() {
      devices = [];
      session = null;
      steps = [];
      replacing = null;
    },
  };
}
