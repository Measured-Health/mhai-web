import { normalizeBackupCode } from "./codes";
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

const SECRET = "JBSWY3DPEHPK3PXP";
const LOCK_MS = 15 * 60_000;
const MAX_TRIES = 5;

const trigger = (login: string) =>
  login
    .toLowerCase()
    .split("@")[0]!
    .split(/[._+-]/)[0] ?? "";

/** Sample accounts for the demo's sign-in page. Any other email works too. */
export const SAMPLE_ACCOUNTS = [
  {
    email: "a.reyes@havanahospital.org",
    label: "Clinician",
    note: "Signs straight in",
  },
  {
    email: "mfa.okafor@havanahospital.org",
    label: "Clinician with two-step",
    note: "Code 123456",
  },
  {
    email: "new.bello@havanahospital.org",
    label: "New account",
    note: "First sign-in steps",
  },
  {
    email: "admin.adeyemi@havanahospital.org",
    label: "Hospital admin",
    note: "Shows the 403 page",
  },
  {
    email: "locked.eze@havanahospital.org",
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
    displayName: "Kemi Adeyemi",
    fullName: "Kemi Adeyemi",
    roleTitle: "Hospital admin",
    specialty: null,
  },
  auditor: {
    displayName: "Tunde Bakare",
    fullName: "Tunde Bakare",
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

function userFor(login: string, role: Role, mfaEnabled: boolean): User {
  return {
    username: login.split("@")[0]!,
    email: login.includes("@") ? login : null,
    ...(PEOPLE[trigger(login)] ?? REYES),
    role,
    hospital: "Havana Hospital",
    mfaEnabled,
    backupCodesLeft: mfaEnabled ? 8 : null,
  };
}

/** The demo's sign-in: memory only (a reload signs you out), never stored. */
export function createMockAuthClient({
  now = () => Date.now(),
}: { now?: () => number } = {}): AuthClient {
  let session: User | null = null;
  let steps: FirstStep[] = [];
  let pending: User | null = null;
  let backupLeft = new Set(MOCK_BACKUP_CODES);
  const failures = new Map<string, number>();
  const lockedUntil = new Map<string, number>();
  let devices: Device[] = [];

  const startSession = (u: User, owed: FirstStep[] = []): void => {
    session = u;
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
        pending = userFor(key, "clinician", true);
        return { status: "mfa_required" };
      }
      if (word === "new") {
        const u = userFor(key, "clinician", false);
        const owed: FirstStep[] = ["terms", "password", "mfa"];
        startSession(u, owed);
        return { status: "signed_in", user: u, steps: [...owed] };
      }
      const role: Role =
        word === "admin"
          ? "admin"
          : word === "auditor"
            ? "auditor"
            : "clinician";
      const u = userFor(key, role, true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signInWithHospital() {
      const u = userFor("a.reyes@havanahospital.org", "clinician", true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async verifyCode(code, { backup }) {
      if (!pending) throw new AuthError("mfa_expired");
      if (backup) {
        const c = normalizeBackupCode(code);
        if (!backupLeft.has(c)) throw new AuthError("mfa_invalid");
        backupLeft.delete(c);
      } else if (code.replace(/\D/g, "") !== MOCK_CODE) {
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
      const u = userFor("a.reyes@havanahospital.org", "clinician", true);
      startSession(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signOut() {
      session = null;
      steps = [];
      pending = null;
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
      backupLeft = new Set(MOCK_BACKUP_CODES);
      return {
        otpauthUri: `otpauth://totp/MHAI:${encodeURIComponent(u.username)}?secret=${SECRET}&issuer=MHAI`,
        secret: SECRET,
        backupCodes: [...MOCK_BACKUP_CODES],
      };
    },

    async confirmMfaSetup(code) {
      const u = requireSession();
      if (code.replace(/\D/g, "") !== MOCK_CODE)
        throw new AuthError("mfa_invalid");
      session = { ...u, mfaEnabled: true, backupCodesLeft: 10 };
      done("mfa");
    },

    async regenerateBackupCodes() {
      const u = requireSession();
      backupLeft = new Set(MOCK_NEW_BACKUP_CODES);
      session = { ...u, backupCodesLeft: 10 };
      return [...MOCK_NEW_BACKUP_CODES];
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
    },
  };
}
