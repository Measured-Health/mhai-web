import { normalizeBackupCode } from "@mhai/api-client/codes";
import { offerNewBackupCode } from "@mhai/api-client/new-backup-code";
import { ApiError } from "@mhai/api-client/errors";
import { verifyTotp } from "@mhai/api-client/totp";

/** The demo's two-step code. */
export const MOCK_CODE = "123456";
/** An obviously synthetic code in core's shape: "aaaaa-aaaaa" for "a". */
const fakeCode = (c: string) => `${c.repeat(5)}-${c.repeat(5)}`;
/**
 * The demo's backup codes (the clinical demo's set: synthetic, in core's
 * shape), in the order they are issued. An account holds one at a time:
 * using it, or making a new one, moves to the next.
 */
export const MOCK_BACKUP_CODES = [
  fakeCode("a"),
  fakeCode("b"),
  fakeCode("c"),
  fakeCode("d"),
  fakeCode("e"),
  fakeCode("f"),
  fakeCode("g"),
  fakeCode("h"),
  fakeCode("j"),
  fakeCode("k"),
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
 * actions: one backup code at a time (using it issues the next, as core
 * does), wrong tries counted per person, five wrong tries lock that person
 * for 15 minutes of the given clock.
 */
export interface DemoStepUp {
  /** The demo code or a current authenticator code. */
  digitsOk(code: string): Promise<boolean>;
  /** Uses the backup code if it is the current one: the new one, else null. */
  takeBackup(code: string): string | null;
  /** The backup code that works now. */
  backupCode(): string;
  /** Replaces the backup code with the next one, and returns it. */
  nextBackupCode(): string;
  /** Back to the first code (a new two-step setup). */
  resetBackupCode(): string;
  /**
   * Checks a code. A backup code that works hands its replacement to
   * `fresh`: by default it is offered as core's reply header would be.
   */
  check(
    email: string | null,
    code: StepUpCode,
    fresh?: (code: string) => void,
  ): Promise<StepUpResult>;
}

export function createStepUp(now: () => number = () => Date.now()): DemoStepUp {
  let issued = 0;
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
      if (normalizeBackupCode(code) !== self.backupCode()) return null;
      return self.nextBackupCode();
    },
    backupCode: () => MOCK_BACKUP_CODES[issued % MOCK_BACKUP_CODES.length]!,
    nextBackupCode() {
      issued += 1;
      return self.backupCode();
    },
    resetBackupCode() {
      issued = 0;
      return self.backupCode();
    },
    async check(email, code, fresh = offerNewBackupCode) {
      const key = email?.toLowerCase() ?? "";
      if ((lockedUntil.get(key) ?? 0) > now()) return "locked";
      let ok: boolean;
      if ("backup_code" in code) {
        const next = self.takeBackup(code.backup_code);
        if (next) fresh(next);
        ok = next !== null;
      } else ok = await self.digitsOk(code.mfa_code);
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
