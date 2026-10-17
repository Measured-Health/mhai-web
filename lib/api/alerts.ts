import type {
  AlertOut,
  AlertPageOut,
  AlertQuery,
  DismissIn,
  NotificationSettingsOut,
  NotificationSettingsPatchIn,
  UnreadCountOut,
} from "./alerts-contract";
import type { WriteOpts } from "./contract";
import { createLiveAlertsClient } from "./live-alerts";
import { createMockAlerts } from "./mock-alerts";

/** Patient alerts and the signed-in clinician's notification settings. */
export interface AlertsClient {
  listAlerts(q: AlertQuery): Promise<AlertPageOut>;
  getUnreadCount(): Promise<UnreadCountOut>;
  /** Throws `AlertHandledError` when someone else handled it first. */
  acknowledgeAlert(id: string, opts?: WriteOpts): Promise<AlertOut>;
  /** Throws `AlertHandledError` when someone else handled it first. */
  dismissAlert(id: string, d: DismissIn, opts?: WriteOpts): Promise<AlertOut>;
  getNotificationSettings(): Promise<NotificationSettingsOut>;
  updateNotificationSettings(
    p: NotificationSettingsPatchIn,
    opts?: WriteOpts,
  ): Promise<NotificationSettingsOut>;
}

let alerts: AlertsClient | undefined;

/** Sample alerts when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAlertsClient(): AlertsClient {
  return (alerts ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAlerts()
      : createLiveAlertsClient());
}
