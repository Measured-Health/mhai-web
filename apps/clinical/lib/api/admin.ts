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
  StaffRemoveAuth,
  UsageOut,
  UsagePeriod,
} from "./admin-contract";
import type { WriteOpts } from "./contract";
import { createLiveAdminClient } from "./live-admin";
import { createMockAdmin } from "./mock-admin";

export type StaffAction =
  | "deactivate"
  | "reactivate"
  | "password-reset"
  | "reset-mfa"
  | "remind"
  | "resend-invite";

/** The hospital admin side's calls. Everything is scoped to one hospital. */
export interface AdminClient {
  listStaff(): Promise<StaffOut[]>;
  inviteStaff(i: InviteIn, opts?: WriteOpts): Promise<InviteOut>;
  updateStaff(id: string, p: StaffPatchIn, opts?: WriteOpts): Promise<StaffOut>;
  staffAction(
    id: string,
    action: StaffAction,
    opts?: WriteOpts,
  ): Promise<StaffOut>;
  /** Needs the admin's two-step code; also cancels an invite. */
  removeStaff(
    id: string,
    auth: StaffRemoveAuth,
    opts: WriteOpts & { idempotencyKey: string },
  ): Promise<void>;
  getSettings(): Promise<HospitalSettingsOut>;
  updateSettings(
    p: SettingsPatchIn,
    opts?: WriteOpts,
  ): Promise<HospitalSettingsOut>;
  getUsage(period: UsagePeriod): Promise<UsageOut>;
  listActivity(q: ActivityQuery): Promise<ActivityPageOut>;
  getOversight(): Promise<OversightOut>;
  listEligibleReviewers(correctionId: string): Promise<ReviewerOut[]>;
  remindReviewers(correctionId: string, opts?: WriteOpts): Promise<void>;
  assignReviewer(
    correctionId: string,
    staffId: string,
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
