/**
 * A backup code as typed: lowercased, punctuation and spaces stripped, at
 * most 10 characters, with the dash after the fifth (core's `xxxxx-xxxxx`).
 * Core ignores case, spaces and dashes too, so this only tidies.
 */
export function normalizeBackupCode(s: string): string {
  const clean = s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

/** A whole backup code as typed (normalized): 11 characters with the dash. */
export const BACKUP_CODE_LENGTH = 11;

/**
 * A backup code exactly as core issues it: five and five letters and
 * digits from its alphabet (no 0, 1, i, l or o), joined by a dash.
 */
export const BACKUP_CODE = /^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/;

/**
 * The response header that carries a person's new backup code after a
 * backup code confirmed an action (each account has one code at a time).
 */
export const NEW_BACKUP_CODE_HEADER = "X-MHAI-New-Backup-Code";

/** A backup code read strictly: the exact shape, else null (never trimmed or fixed). */
export function readBackupCode(v: unknown): string | null {
  return typeof v === "string" && BACKUP_CODE.test(v) ? v : null;
}

/**
 * Core's `recovery_codes` (an array kept for the contract): exactly one
 * code in its exact shape, else null. Never the first of several.
 */
export function oneBackupCode(v: unknown): string | null {
  return Array.isArray(v) && v.length === 1 ? readBackupCode(v[0]) : null;
}
