/** A short list of the most common passwords. The server checks leaked lists. */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "123456789012",
  "1234567890123",
  "password1234",
  "password12345",
  "passwordpassword",
  "qwertyuiop12",
  "qwertyuiopas",
  "iloveyou1234",
  "welcome12345",
  "letmein12345",
  "administrator",
  "changeme1234",
  "abcdefghijkl",
  "abc123456789",
  "111111111111",
  "000000000000",
  "trustno1trustno1",
  "football1234",
  "baseball1234",
  "sunshine1234",
  "princess1234",
  "monkey123456",
  "dragon123456",
  "superman1234",
  "hospital1234",
  "doctor123456",
  "nurse1234567",
  "medicine1234",
  "passw0rd1234",
  "p@ssw0rd1234",
  "p@ssword1234",
  "qwerty123456",
  "1q2w3e4r5t6y",
  "zaq12wsxcde3",
  "asdfghjkl123",
  "mhai12345678",
]);

export interface PasswordRule {
  id: "length" | "common" | "identity";
  label: string;
  ok: boolean;
}

export function passwordRules(
  pw: string,
  identity: string | null,
): PasswordRule[] {
  const lower = pw.toLowerCase();
  const name = identity?.split("@")[0]?.toLowerCase() ?? "";
  return [
    { id: "length", label: "At least 12 characters", ok: pw.length >= 12 },
    {
      id: "common",
      label: "Not a common or leaked password",
      ok: pw.length > 0 && !COMMON_PASSWORDS.has(lower) && !/^(.)\1*$/.test(pw),
    },
    {
      id: "identity",
      label: "Not your email",
      ok: pw.length > 0 && (name.length < 3 || !lower.includes(name)),
    },
  ];
}

export function passwordError(
  next: string,
  confirm: string,
  identity: string | null,
): string | null {
  if (!passwordRules(next, identity).every((r) => r.ok))
    return "Choose a password that meets every rule.";
  if (next !== confirm) return "The passwords don't match.";
  return null;
}
