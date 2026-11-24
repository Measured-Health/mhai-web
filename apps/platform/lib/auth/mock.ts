import { ApiError } from "@mhai/api-client/errors";
import { setMockSignedIn } from "../api/mock";
import { seedTeam, TEAM_EMAILS } from "../api/fixtures";
import {
  getDemoStepUp,
  MOCK_NEW_TOTP_SECRET,
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

/** The sample team's new platform admin (first sign-in steps). */
export const NEW_ADMIN_EMAIL = TEAM_EMAILS.newAdmin;
const LOCK_MS = 15 * 60_000;
const MAX_TRIES = 5;
/** How long a move to a new app waits for its first code (core: 15 minutes). */
export const REPLACE_MS = 15 * 60_000;
// Core's order: password and two-step first, then the terms.
const ALL_STEPS: FirstStep[] = ["password", "mfa", "terms"];

interface Account {
  name: string;
  roles: PlatformRole[];
  mfaEnabled: boolean;
}

/** The sample team's members, by email. */
function accounts(): Map<string, Account> {
  const m = new Map<string, Account>();
  for (const t of seedTeam(Date.now()))
    m.set(t.email, {
      name: t.name,
      roles: [t.role],
      // An unaccepted invite or a new admin hasn't set up two-step yet.
      mfaEnabled: t.status === "active" && t.mfa_enabled,
    });
  return m;
}

/** Sample accounts for the demo's sign-in page. */
export const SAMPLE_ACCOUNTS = [
  { email: TEAM_EMAILS.ada, label: "Ada Bakare", note: "Platform admin" },
  { email: TEAM_EMAILS.tunde, label: "Tunde Okafor", note: "Platform admin" },
  {
    email: TEAM_EMAILS.bola,
    label: "Bola Hassan",
    note: "Platform admin, linked to Pilot Hospital",
  },
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
  /** A move to a new app waiting for its first code (memory only). */
  let replacing: { secret: string; at: number } | null = null;

  const userFor = (email: string, a: Account): User => ({
    id: email.split("@")[0]!,
    email,
    name: a.name,
    roles: [...a.roles],
    mfaEnabled: a.mfaEnabled,
    backupCodesLeft: a.mfaEnabled ? 1 : null,
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
    replacing = null;
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
      // sign-in step is owed, the terms last. The sample team never records
      // the setup, so the new admin repeats it on each sign-in (on purpose).
      start(u, ALL_STEPS);
      return { status: "signed_in", user: u, steps: [...ALL_STEPS] };
    },

    async verifyCode(code, { backup }) {
      if (!pending) throw new AuthError("mfa_expired");
      // A backup code signs in once: its replacement comes back with the
      // session, as core's reply carries it.
      const got: { code?: string } = {};
      const r = await codes.check(
        pending.email,
        backup ? { backup_code: code } : { mfa_code: code },
        { fresh: (c) => (got.code = c) },
      );
      if (r === "locked") throw new AuthError("mfa_locked");
      if (r === "invalid") throw new AuthError("mfa_invalid");
      const u = pending;
      start(u);
      return {
        status: "signed_in",
        user: u,
        steps: [],
        ...(got.code ? { newBackupCode: got.code } : {}),
      };
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
      const backupCode = codes.resetBackupCode();
      codes.setSecret(MOCK_TOTP_SECRET);
      const label = encodeURIComponent("MHAI Platform Demo");
      return {
        // Listed as a demo in authenticator apps, so the shared demo key is
        // never mistaken for a real account.
        otpauthUri: `otpauth://totp/${label}:${encodeURIComponent(u.email)}?secret=${MOCK_TOTP_SECRET}&issuer=${label}&algorithm=SHA1&digits=6&period=30`,
        secret: MOCK_TOTP_SECRET,
        backupCode,
      };
    },

    async confirmMfaSetup(code) {
      const u = requireSession();
      if (!(await codes.digitsOk(code))) throw new AuthError("mfa_invalid");
      session = { ...u, mfaEnabled: true, backupCodesLeft: 1 };
      done("mfa");
    },

    async regenerateBackupCode(code) {
      const u = requireSession();
      // Core asks for the two-step code, or the current backup code (which
      // then makes way for the new one in the same step, in the reply's
      // body only).
      const got: { code?: string } = {};
      const r = await codes.check(u.email, code, {
        fresh: (c) => (got.code = c),
      });
      if (r === "locked") throw new ApiError(429, "mfa_locked");
      if (r === "invalid") throw new ApiError(403, "mfa_invalid");
      session = { ...u, backupCodesLeft: 1 };
      return got.code ?? codes.nextBackupCode();
    },

    // Core's rules: a step-up starts it, the current app works until the
    // new app's code confirms it (within 15 minutes), the backup codes stay.
    async startMfaReplace(code) {
      const u = session;
      if (!u) throw new ApiError(401, "session_expired");
      if (!u.mfaEnabled) throw new ApiError(403, "mfa_required");
      const r = await codes.check(u.email, code);
      if (r === "locked") throw new ApiError(429, "mfa_locked");
      if (r === "invalid") throw new ApiError(403, "mfa_invalid");
      replacing = { secret: MOCK_NEW_TOTP_SECRET, at: now() };
      const label = encodeURIComponent("MHAI Platform Demo");
      return {
        otpauthUri: `otpauth://totp/${label}:${encodeURIComponent(u.email)}?secret=${MOCK_NEW_TOTP_SECRET}&issuer=${label}&algorithm=SHA1&digits=6&period=30`,
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
      const r = await codes.check(
        u.email,
        { mfa_code: code },
        { secret: waiting.secret },
      );
      if (r === "locked") throw new ApiError(429, "mfa_locked");
      if (r === "invalid") throw new ApiError(403, "mfa_invalid");
      codes.setSecret(waiting.secret);
      replacing = null;
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
