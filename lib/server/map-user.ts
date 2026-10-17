import type { ApiSession, ApiUser } from "../api/auth-contract";
import type { Device, FirstStep, Role, User } from "../auth/types";

export type { ApiUser, ApiLoginOk, ApiMfaRequired } from "../api/auth-contract";

const ROLES: readonly Role[] = [
  "clinician",
  "hospital_admin",
  "admin",
  "auditor",
  "researcher",
];

/** Known roles only, each once. None known reads as non-clinical, never as a clinician. */
export function rolesOf(u: Pick<ApiUser, "role" | "roles">): Role[] {
  const raw = Array.isArray(u.roles) ? u.roles : [u.role];
  const known = [
    ...new Set(raw.filter((r): r is Role => ROLES.includes(r as Role))),
  ];
  return known.length ? known : ["researcher"];
}

export function toUser(u: ApiUser): User {
  return {
    username: u.username,
    email: u.email ?? null,
    displayName: u.display_name || u.full_name || u.username,
    fullName: u.full_name ?? null,
    roles: rolesOf(u),
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
