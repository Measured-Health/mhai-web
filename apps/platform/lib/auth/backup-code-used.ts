import { pendingBackupCode } from "@mhai/api-client/new-backup-code";

/**
 * Backup codes ready after one confirmed an action. Core issues the
 * replacement with the reply (NewBackupCodeHost shows it), so one is ready
 * again; without one (an older reply), the used code is gone, and Account
 * offers to make a new one at 0. Unknown stays unknown.
 */
export function backupCodesAfterUse(left: number | null): number | null {
  if (pendingBackupCode() !== null) return 1;
  return left === null ? null : Math.max(0, left - 1);
}
