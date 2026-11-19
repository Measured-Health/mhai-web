import type {
  ActivityPageOut,
  ActivityQuery,
  HospitalSettingsOut,
  InviteIn,
  InviteOut,
  OversightOut,
  ReviewerOut,
  SettingsPatchIn,
  StaffOut,
  StaffPatchIn,
  StaffWithLink,
  StepUpAuth,
  UsageOut,
  UsagePeriod,
} from "./admin-contract";
import type { WriteOpts } from "./contract";
import { createLiveAdminClient } from "./live-admin";
import { createMockAdmin } from "./mock-admin";

/**
 * The account changes that answer with the person (`StaffOut`); each needs
 * a step-up code. `reset-mfa` (core 1.33.0) removes their two-step.
 */
export type StaffAction = "deactivate" | "reactivate" | "reset-mfa";

/**
 * The account changes that send the person a link (core 1.33.0), with a
 * step-up code. On the demo deployment core also hands the link back.
 */
export type LinkAction = "password-reset" | "resend-invite";

/**
 * The hospital admin side's calls. Everything is scoped to one hospital.
 * Until core 1.33.0 is deployed, the invite, reset, removal, reminder and
 * assignment calls answer 501 `not_implemented`, which the screens show as
 * "Not available yet".
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
  /** A reset link or a fresh invite; the old link stops working. */
  sendLink(
    id: string,
    action: LinkAction,
    auth: StepUpAuth,
    opts?: WriteOpts,
  ): Promise<StaffWithLink>;
  /** A two-step setup reminder; no code needed. Once a day per person. */
  remindStaff(id: string, opts?: WriteOpts): Promise<StaffOut>;
  /** Removes the person for good (or cancels their invite). */
  removeStaff(id: string, auth: StepUpAuth, opts?: WriteOpts): Promise<void>;
  inviteStaff(
    p: InviteIn,
    auth: StepUpAuth,
    opts?: WriteOpts,
  ): Promise<InviteOut>;
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
  /** The assigned reviewer, or everyone who can review it. Once an hour. */
  remindReviewers(correctionId: string, opts?: WriteOpts): Promise<void>;
  /** `null` clears the assignment. */
  assignReviewer(
    correctionId: string,
    staffId: string | null,
    opts?: WriteOpts,
  ): Promise<void>;
}

let admin: AdminClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAdminClient(): AdminClient {
  return (admin ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAdmin()
      : createLiveAdminClient());
}
