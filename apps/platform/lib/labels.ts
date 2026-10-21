import type { DeactivateReason, HospitalStatus } from "./api/contract";

const STATUS: Record<HospitalStatus, string> = {
  active: "Active",
  setup_incomplete: "Set-up incomplete",
  deactivated: "Deactivated",
  removal_pending: "Removal pending",
  removal_scheduled: "Removal scheduled",
  removed: "Removed",
};
export const STATUSES = Object.keys(STATUS) as HospitalStatus[];
export const statusLabel = (s: HospitalStatus) => STATUS[s];

const REASON: Record<DeactivateReason, string> = {
  contract_ended: "Contract ended",
  security_concern: "Security concern",
  hospital_request: "At the hospital's request",
  other: "Other",
};
export const REASONS = Object.keys(REASON) as DeactivateReason[];
export const reasonLabel = (r: DeactivateReason) => REASON[r];
