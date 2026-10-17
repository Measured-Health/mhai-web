import type { AdminClient } from "@/lib/api/admin";
import type { ActivityEventOut, StaffOut } from "@/lib/api/admin-contract";
import { createMockAdmin } from "@/lib/api/mock-admin";

/** The sample hospital's clock in tests: 16 Oct 2026, 10:00 UTC. */
export const ADMIN_NOW = Date.UTC(2026, 9, 16, 10, 0, 0);

export function makeStaff(over: Partial<StaffOut> = {}): StaffOut {
  return {
    id: "s-test",
    full_name: "Dr. Test Person",
    display_name: "Dr. Person",
    email: "t.person@havanahospital.org",
    roles: ["clinician"],
    specialty: "Internal Medicine",
    can_review: false,
    review_specialties: [],
    status: "active",
    issues: [],
    sign_in: "sso",
    last_active_at: new Date(ADMIN_NOW - 3_600_000).toISOString(),
    joined_at: new Date(ADMIN_NOW - 90 * 86_400_000).toISOString(),
    invited_at: null,
    invite_expires_at: null,
    is_you: false,
    version: 1,
    ...over,
  };
}

export function makeEvent(
  over: Partial<ActivityEventOut> = {},
): ActivityEventOut {
  return {
    id: "e-test",
    at: new Date(ADMIN_NOW - 600_000).toISOString(),
    type: "sign_in",
    kind: "signed_in",
    actor: { display_name: "Dr. Okafor" },
    target: null,
    specialty: null,
    confidence: null,
    device: null,
    count: null,
    flag: null,
    ...over,
  };
}

/** The sample hospital, instant, at ADMIN_NOW, with `email` as "you". */
export const mockAdminAs = (email: string | null): AdminClient =>
  createMockAdmin({
    now: () => ADMIN_NOW,
    me: async () => email,
    delayMs: 0,
  });

/** The same on the real clock, for screens (they read `Date.now()`). */
export const screenAdminAs = (email: string | null): AdminClient =>
  createMockAdmin({ me: async () => email, delayMs: 0 });
