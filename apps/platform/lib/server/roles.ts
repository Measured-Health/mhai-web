import type { ApiUser } from "../api/auth-contract";

export type PlatformRole = "platform_admin" | "auditor";

/**
 * The platform roles in a backend role list, each once. `admin` is today's
 * backend name for a platform admin. Everything else (clinician, hospital
 * admin, ...) is dropped, so an empty list means "can't use this app".
 */
export function toPlatformRoles(apiRoles: string[]): PlatformRole[] {
  const out: PlatformRole[] = [];
  if (apiRoles.some((r) => r === "admin" || r === "platform_admin"))
    out.push("platform_admin");
  if (apiRoles.includes("auditor")) out.push("auditor");
  return out;
}

/** Every backend role the user holds (`roles`, else the primary `role`). */
export const apiRolesOf = (u: Pick<ApiUser, "role" | "roles">): string[] =>
  Array.isArray(u.roles) ? u.roles : typeof u.role === "string" ? [u.role] : [];
