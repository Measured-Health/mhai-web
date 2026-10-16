import type { ApiSession, ApiUser } from "../api/auth-contract";
import type { Device, FirstStep, Role, User } from "../auth/types";

export type { ApiUser, ApiLoginOk, ApiMfaRequired } from "../api/auth-contract";

const ROLES: readonly Role[] = ["clinician", "admin", "auditor", "researcher"];

export function toUser(u: ApiUser): User {
  return {
    username: u.username,
    email: u.email ?? null,
    displayName: u.display_name || u.full_name || u.username,
    fullName: u.full_name ?? null,
    // Anything unexpected is treated as non-clinical, never as a clinician.
    role: ROLES.includes(u.role as Role) ? (u.role as Role) : "researcher",
    roleTitle: u.role_title ?? null,
    specialty: u.specialty ?? null,
    hospital: u.hospital ?? null,
    mfaEnabled: u.mfa_enabled === true,
    backupCodesLeft: u.recovery_codes_left ?? null,
  };
}

/** First sign-in steps, only from what the API says (never guessed). */
export function stepsFor(u: ApiUser): FirstStep[] {
  const steps: FirstStep[] = [];
  if (u.must_change_password || u.terms_accepted_at === null)
    steps.push("terms");
  if (u.must_change_password) steps.push("password");
  if (u.mfa_enabled === false) steps.push("mfa");
  return steps;
}

export function toDevice(s: ApiSession): Device {
  const seen = Date.parse(s.last_seen_at);
  return {
    id: s.id,
    label: s.device,
    place: s.location ?? null,
    lastActiveAt: Number.isFinite(seen) ? seen : null,
    current: s.current,
  };
}
