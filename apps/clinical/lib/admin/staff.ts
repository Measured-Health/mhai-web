import type { SignInMethod, StaffOut, StaffRole } from "../api/admin-contract";
import { ageLabel } from "../time";

/** Core has no invites (1.24.0): nobody is ever invited. */
export type StaffState = "active" | "attention" | "deactivated";
export type StaffFilter = "all" | StaffState;

/** Words and chip tones (spec §7: a word and an icon, never colour alone). */
export const STAFF_STATE: Record<
  StaffState,
  { label: string; tone: "ok" | "brand" | "warn" | "muted" }
> = {
  active: { label: "Active", tone: "ok" },
  attention: { label: "Needs attention", tone: "warn" },
  deactivated: { label: "Deactivated", tone: "muted" },
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  clinician: "Clinician",
  analyst: "Analyst",
  hospital_admin: "Hospital admin",
};

export const SIGN_IN_LABEL: Record<SignInMethod, string> = {
  sso: "Hospital account",
  password_mfa: "Password + two-step",
  password: "Password",
};

export const STAFF_FILTERS: readonly { id: StaffFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "attention", label: "Needs attention" },
  { id: "deactivated", label: "Deactivated" },
];

const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

export function staffState(s: StaffOut): StaffState {
  if (s.status === "deactivated") return "deactivated";
  return s.issues.length ? "attention" : "active";
}

/** What needs attention, in words; null when nothing does. */
export function attentionLabel(s: StaffOut): string | null {
  if (s.status === "active" && s.issues.includes("mfa_not_set_up"))
    return "Two-step not set up";
  return null;
}

/** The status column: the problem itself when there is one (as the mockup shows). */
export const statusText = (s: StaffOut): string =>
  attentionLabel(s) ?? STAFF_STATE[staffState(s)].label;

export function staffCounts(list: StaffOut[]): Record<StaffFilter, number> {
  const c: Record<StaffFilter, number> = {
    all: list.length,
    active: 0,
    attention: 0,
    deactivated: 0,
  };
  for (const s of list) c[staffState(s)]++;
  return c;
}

const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "Dr. Ana Reyes" sorts as "Ana Reyes". */
export const sortName = (name: string) =>
  name.replace(/^(dr|prof|mr|mrs|ms|nurse)\.?\s+/i, "");

/** Search name, email and specialty; ignores case and accents. */
export function filterStaff(
  list: StaffOut[],
  filter: StaffFilter,
  search: string,
): StaffOut[] {
  const q = fold(search.trim());
  return list
    .filter((s) => filter === "all" || staffState(s) === filter)
    .filter(
      (s) =>
        !q ||
        [s.full_name, s.email, s.specialty ?? ""].some((f) =>
          fold(f).includes(q),
        ),
    )
    .sort((a, b) =>
      sortName(a.full_name).localeCompare(sortName(b.full_name), "en", {
        sensitivity: "base",
      }),
    );
}

/** As core counts them for the last-admin rule: active, with two-step on. */
export const isActiveAdmin = (s: StaffOut) =>
  s.status === "active" &&
  s.roles.includes("hospital_admin") &&
  !s.issues.includes("mfa_not_set_up");

export const activeAdminCount = (list: StaffOut[]) =>
  list.filter(isActiveAdmin).length;

export type GuardAction = "deactivate" | "drop_admin";
export type Guard = { ok: true } | { ok: false; reason: string };

const SELF: Record<GuardAction, string> = {
  deactivate:
    "You can't deactivate your own account. Ask another hospital admin.",
  drop_admin:
    "You can't remove your own hospital admin role. Ask another hospital admin.",
};

export const LAST_ADMIN =
  "The hospital needs at least one active hospital admin with two-step verification on. Make someone else a hospital admin first.";

/** Core refuses any role an admin adds to themselves, Clinician included (403 self_change). */
export const SELF_ADD =
  "You can't give yourself a role. Ask another hospital admin. You can remove your own Clinician or Analyst role.";

/** Whether an admin may do this to `target` (R5). The API checks again. */
export function guardFor(
  action: GuardAction,
  target: StaffOut,
  list: StaffOut[],
): Guard {
  if (target.is_you) return { ok: false, reason: SELF[action] };
  if (isActiveAdmin(target) && activeAdminCount(list) <= 1)
    return { ok: false, reason: LAST_ADMIN };
  return { ok: true };
}

/** "now", "42 min", "2 h", "3 d", "3 w"; null when never or unknown. */
export function lastActiveLabel(
  iso: string | null,
  now: number,
): string | null {
  const t = time(iso);
  if (t === null) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 2) return "now";
  if (m < 14 * 1440) return ageLabel(t, now);
  return `${Math.round(m / 10_080)} w`;
}

export const rolesText = (roles: StaffRole[]) =>
  roles.map((r) => ROLE_LABEL[r]).join(" · ");

/** Two-step missing where the hospital requires it; hospital admins always need it. */
export const policyBroken = (s: StaffOut, requireForClinicians: boolean) =>
  s.status === "active" &&
  s.issues.includes("mfa_not_set_up") &&
  (s.roles.includes("hospital_admin") || requireForClinicians);
