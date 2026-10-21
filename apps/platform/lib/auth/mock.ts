import { setMockSignedIn } from "../api/mock";
import { seedTeam, TEAM_EMAILS } from "../api/fixtures";
import {
  getDemoStepUp,
  MOCK_BACKUP_CODES,
  MOCK_TOTP_SECRET,
  type DemoStepUp,
} from "../api/step-up";
import {
  AuthError,
  type AuthClient,
  type Device,
  type FirstStep,
  type PlatformRole,
  type SignInResult,
  type User,
} from "./types";

/** A new platform admin: first sign-in steps, then two-step setup. */
export const NEW_ADMIN_EMAIL = "new.admin@measured-health.example";
/** Regenerated demo backup codes: the originals reversed. */
export const MOCK_NEW_BACKUP_CODES = MOCK_BACKUP_CODES.map((c) =>
  c.split("").reverse().join(""),
);
const LOCK_MS = 15 * 60_000;
const MAX_TRIES = 5;
const ALL_STEPS: FirstStep[] = ["password", "terms", "mfa"];

interface Account {
  name: string;
  roles: PlatformRole[];
  mfaEnabled: boolean;
}

/** The team members from the sample data, plus the new admin. */
function accounts(): Map<string, Account> {
  const m = new Map<string, Account>();
  for (const t of seedTeam(Date.now()))
    m.set(t.email, {
      name: t.name,
      roles: [t.role],
      // An unaccepted invite hasn't set up two-step yet.
      mfaEnabled: t.status === "active" && t.mfa_enabled,
    });
  m.set(NEW_ADMIN_EMAIL, {
    name: "New platform admin",
    roles: ["platform_admin"],
    mfaEnabled: false,
  });
  return m;
}

/** Sample accounts for the demo's sign-in page. */
export const SAMPLE_ACCOUNTS = [
  { email: TEAM_EMAILS.ada, label: "Ada Bakare", note: "Platform admin" },
  { email: TEAM_EMAILS.tunde, label: "Tunde Okafor", note: "Platform admin" },
  { email: TEAM_EMAILS.amara, label: "Amara Eze", note: "Auditor (read-only)" },
  {
    email: NEW_ADMIN_EMAIL,
    label: "New platform admin",
    note: "First sign-in: password, terms and two-step",
  },
] as const;

/**
 * The demo's sign-in: memory only (a reload signs you out), never stored.
 * Codes are checked by the demo's shared two-step codes, so a backup code
 * spent here is spent for step-up actions too, and the lock is shared.
 * Any email that isn't on the team is a hospital account: `not_platform`.
 */
export function createMockAuthClient({
  now = () => Date.now(),
  stepUp,
}: { now?: () => number; stepUp?: DemoStepUp } = {}): AuthClient {
  const codes = stepUp ?? getDemoStepUp();
  const people = accounts();
  let session: User | null = null;
  let steps: FirstStep[] = [];
  let pending: User | null = null;
  const failures = new Map<string, number>();
  const lockedUntil = new Map<string, number>();
  let devices: Device[] = [];

  const userFor = (email: string, a: Account): User => ({
    id: email.split("@")[0]!,
    email,
    name: a.name,
    roles: [...a.roles],
    mfaEnabled: a.mfaEnabled,
    backupCodesLeft: a.mfaEnabled ? 10 : null,
  });

  const start = (u: User, owed: FirstStep[] = []) => {
    session = u;
    steps = [...owed];
    pending = null;
    setMockSignedIn(u.email);
    devices = [
      {
        id: "this",
        label: "Chrome on Windows",
        place: "Lagos",
        lastActiveAt: now(),
        current: true,
      },
      {
        id: "laptop_2",
        label: "Firefox on macOS",
        place: "Abuja",
        lastActiveAt: now() - 3 * 3_600_000,
        current: false,
      },
    ];
  };
  const end = () => {
    session = null;
    steps = [];
    pending = null;
    setMockSignedIn(null);
  };
  const requireSession = () => {
    if (!session) throw new AuthError("session_expired");
    return session;
  };
  const done = (step: FirstStep) => {
    steps = steps.filter((s) => s !== step);
  };

  return {
    async getSession() {
      return session ? { user: session, steps: [...steps] } : null;
    },

    async signIn(login, password): Promise<SignInResult> {
      const key = login.trim().toLowerCase();
      if ((lockedUntil.get(key) ?? 0) > now()) throw new AuthError("locked");
      // A new sign-in replaces whoever was signed in.
      end();
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
      const a = people.get(key);
      // A clinician (hospital) account: signed out at once, no session.
      if (!a) return { status: "not_platform" };
      const u = userFor(key, a);
      if (u.mfaEnabled) {
        pending = u;
        return { status: "mfa_required" };
      }
      // Not set up yet (the new admin, an unaccepted invite): every first
      // sign-in step is owed, two-step last.
      start(u, ALL_STEPS);
      return { status: "signed_in", user: u, steps: [...ALL_STEPS] };
    },

    async verifyCode(code, { backup }) {
      if (!pending) throw new AuthError("mfa_expired");
      const r = await codes.check(
        pending.email,
        backup ? { backup_code: code } : { mfa_code: code },
      );
      if (r === "locked") throw new AuthError("mfa_locked");
      if (r === "invalid") throw new AuthError("mfa_invalid");
      const u = backup
        ? {
            ...pending,
            backupCodesLeft: Math.max(0, (pending.backupCodesLeft ?? 0) - 1),
          }
        : pending;
      start(u);
      return { status: "signed_in", user: u, steps: [] };
    },

    async signOut() {
      end();
    },

    async keepAlive() {},

    async acceptTerms() {
      requireSession();
      done("terms");
    },

    async changePassword(current, next) {
      requireSession();
      if (current === "wrong") throw new AuthError("wrong_password");
      if (next.length < 12) throw new AuthError("weak_password");
      done("password");
    },

    async startMfaSetup() {
      const u = requireSession();
      codes.setBackupCodes(MOCK_BACKUP_CODES);
      const label = encodeURIComponent("MHAI Platform Demo");
      return {
        // Listed as a demo in authenticator apps, so the shared demo key is
        // never mistaken for a real account.
        otpauthUri: `otpauth://totp/${label}:${encodeURIComponent(u.email)}?secret=${MOCK_TOTP_SECRET}&issuer=${label}&algorithm=SHA1&digits=6&period=30`,
        secret: MOCK_TOTP_SECRET,
        backupCodes: [...MOCK_BACKUP_CODES],
      };
    },

    async confirmMfaSetup(code) {
      const u = requireSession();
      if (!(await codes.digitsOk(code))) throw new AuthError("mfa_invalid");
      session = { ...u, mfaEnabled: true, backupCodesLeft: 10 };
      done("mfa");
    },

    async regenerateBackupCodes() {
      const u = requireSession();
      codes.setBackupCodes(MOCK_NEW_BACKUP_CODES);
      session = { ...u, backupCodesLeft: 10 };
      return [...MOCK_NEW_BACKUP_CODES];
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
      end();
    },
  };
}
