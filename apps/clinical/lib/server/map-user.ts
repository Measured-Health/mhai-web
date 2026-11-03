import type { ApiSession, ApiUser } from "../api/auth-contract";
import { analysisSignedOff, namedSignedOff } from "./features";
import type { Device, FirstStep, Role, User } from "../auth/types";

export type { ApiUser, ApiLoginOk, ApiMfaRequired } from "../api/auth-contract";

const ROLES: readonly Role[] = [
  "clinician",
  "hospital_admin",
  "admin",
  "auditor",
  "researcher",
  "analyst",
];

/** Known roles only, each once. None known reads as non-clinical, never as a clinician. */
export function rolesOf(u: Pick<ApiUser, "role" | "roles">): Role[] {
  const raw = Array.isArray(u.roles) ? u.roles : [u.role];
  const known = [
    ...new Set(raw.filter((r): r is Role => ROLES.includes(r as Role))),
  ];
  return known.length ? known : ["researcher"];
}

/**
 * The hospital's name: core sends `{id, name}` (contract v1.2.0), older
 * shapes a string. Anything else is null, so it can never be rendered.
 */
function hospitalName(h: unknown): string | null {
  if (typeof h === "string") return h;
  if (h && typeof h === "object" && !Array.isArray(h)) {
    const name = (h as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

/**
 * The key that binds this person's offline outbox: the username, or core's
 * stable id (it has no username). Never empty and never the email (which
 * can change): with neither, the sign-in is refused (the route answers 503).
 */
function stableKey(u: ApiUser): string {
  // Core's id first, as the platform app does; the username is the older shape.
  for (const k of [u.id, u.username])
    if (typeof k === "string" && k.trim() !== "") return k;
  throw new Error("user without a stable id");
}

export function toUser(u: ApiUser): User {
  return {
    username: stableKey(u),
    email: u.email ?? null,
    displayName: u.display_name || u.full_name || u.username || u.email || "",
    fullName: u.full_name ?? null,
    roles: rolesOf(u),
    roleTitle: u.role_title ?? null,
    specialty: u.specialty ?? null,
    hospital: hospitalName(u.hospital),
    mfaEnabled: u.mfa_enabled === true,
    backupCodesLeft: u.recovery_codes_left ?? null,
    // On only when the API says so and the hospital has signed it off.
    // Named access is on only when the API's `named_access` is true,
    // Analysis is on and the named sign-off key is set: the key can only
    // keep it off.
    ...(u.features?.analysis === true && analysisSignedOff()
      ? {
          features: {
            analysis: true,
            ...(namedSignedOff() && u.features?.named_access === true
              ? { named: true }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * First sign-in steps, only from what the API says (never guessed), in
 * core's order: the password and two-step first (an enrolment-only session
 * reaches only those), then the terms, which need a full session.
 */
export function stepsFor(u: ApiUser): FirstStep[] {
  const steps: FirstStep[] = [];
  if (u.must_change_password) steps.push("password");
  if (u.mfa_enabled === false) steps.push("mfa");
  if (u.must_change_password || u.terms_accepted_at === null)
    steps.push("terms");
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
