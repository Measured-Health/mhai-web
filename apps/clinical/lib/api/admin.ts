import type {
  ActivityPageOut,
  ActivityQuery,
  HospitalSettingsOut,
  OversightOut,
  ReviewerOut,
  SettingsPatchIn,
  StaffOut,
  StaffPatchIn,
  StepUpAuth,
  UsageOut,
  UsagePeriod,
} from "./admin-contract";
import type { WriteOpts } from "./contract";
import { createLiveAdminClient } from "./live-admin";
import { createMockAdmin } from "./mock-admin";

/** The account changes core serves (1.24.0); both need a step-up code. */
export type StaffAction = "deactivate" | "reactivate";

/**
 * The hospital admin side's calls. Everything is scoped to one hospital.
 * Core answers 501 `not_implemented` for invites, removing a person,
 * password and two-step resets, the two-step reminder and reviewer
 * reminders and assignment: the screens say "Not available yet" and never
 * call them, so they aren't here.
 */
export interface AdminClient {
  listStaff(): Promise<StaffOut[]>;
  /** Roles and specialty, with the admin's step-up code. */
  updateStaff(
    id: string,
    p: StaffPatchIn,
    auth: StepUpAuth,
    opts?: WriteOpts,
  ): Promise<StaffOut>;
  staffAction(
    id: string,
    action: StaffAction,
    auth: StepUpAuth,
    opts?: WriteOpts,
  ): Promise<StaffOut>;
  getSettings(): Promise<HospitalSettingsOut>;
  /** `auth` only when the edit loosens sign-in (`loosensSignIn`). */
  updateSettings(
    p: SettingsPatchIn,
    auth: StepUpAuth | null,
    opts?: WriteOpts,
  ): Promise<HospitalSettingsOut>;
  getUsage(period: UsagePeriod): Promise<UsageOut>;
  listActivity(q: ActivityQuery): Promise<ActivityPageOut>;
  getOversight(): Promise<OversightOut>;
  listEligibleReviewers(correctionId: string): Promise<ReviewerOut[]>;
}

let admin: AdminClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAdminClient(): AdminClient {
  return (admin ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAdmin()
      : createLiveAdminClient());
}
