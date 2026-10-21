import { normalizeBackupCode } from "@mhai/api-client/codes";
import { ApiError } from "@mhai/api-client/errors";
import { verifyTotp } from "@mhai/api-client/totp";

/** The demo's two-step code. */
export const MOCK_CODE = "123456";
/** The demo's backup codes (the clinical demo's set), each usable once. */
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
] as const;
/** The demo's authenticator secret: real app codes for it work too. */
export const MOCK_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
const LOCK_MS = 15 * 60_000;
const MAX_TRIES = 5;

/** A two-step code as the API takes it. */
export type StepUpCode = { mfa_code: string } | { backup_code: string };
export type StepUpResult = "ok" | "invalid" | "locked";

/**
 * The demo's two-step codes for the platform's sign-in and its step-up
 * actions: one set of backup codes, wrong tries counted per person, five
 * wrong tries lock that person for 15 minutes of the given clock.
 */
export interface DemoStepUp {
  /** The demo code or a current authenticator code. */
  digitsOk(code: string): Promise<boolean>;
  /** Uses up a backup code if it is current; false if not. */
  takeBackup(code: string): boolean;
  setBackupCodes(codes: readonly string[]): void;
  check(email: string | null, code: StepUpCode): Promise<StepUpResult>;
}

export function createStepUp(now: () => number = () => Date.now()): DemoStepUp {
  let backupLeft = new Set<string>(MOCK_BACKUP_CODES);
  const failures = new Map<string, number>();
  const lockedUntil = new Map<string, number>();
  const self: DemoStepUp = {
    async digitsOk(code) {
      const digits = code.replace(/\s/g, "");
      return (
        digits === MOCK_CODE ||
        (await verifyTotp(MOCK_TOTP_SECRET, digits, now()))
      );
    },
    takeBackup(code) {
      return backupLeft.delete(normalizeBackupCode(code));
    },
    setBackupCodes(codes) {
      backupLeft = new Set(codes);
    },
    async check(email, code) {
      const key = email?.toLowerCase() ?? "";
      if ((lockedUntil.get(key) ?? 0) > now()) return "locked";
      const ok =
        "backup_code" in code
          ? self.takeBackup(code.backup_code)
          : await self.digitsOk(code.mfa_code);
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

const demo = createStepUp();
/** The running demo's codes: a backup code spent at sign-in is spent here too. */
export const getDemoStepUp = (): DemoStepUp => demo;

/** The code a request body carries, or null when it has none. */
export function stepUpCode(body: unknown): StepUpCode | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.mfa_code === "string") return { mfa_code: b.mfa_code };
  if (typeof b.backup_code === "string") return { backup_code: b.backup_code };
  return null;
}

/**
 * The step-up gate as the API applies it: 403 `mfa_required` without
 * two-step, 422 `invalid` without a code, 403 `mfa_invalid` for a wrong
 * one and 429 `mfa_locked` once locked.
 */
export async function requireStepUp(
  codes: DemoStepUp,
  {
    email,
    twoStep,
    body,
  }: { email: string | null; twoStep: boolean; body: unknown },
): Promise<void> {
  if (!twoStep) throw new ApiError(403, "mfa_required");
  const code = stepUpCode(body);
  if (!code) throw new ApiError(422, "invalid");
  const r = await codes.check(email, code);
  if (r === "locked") throw new ApiError(429, "mfa_locked");
  if (r === "invalid") throw new ApiError(403, "mfa_invalid");
}
