/** Uppercases and strips punctuation; dashes as XXXX-XXXX at 8 characters. */
export function normalizeBackupCode(s: string): string {
  const clean = s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
