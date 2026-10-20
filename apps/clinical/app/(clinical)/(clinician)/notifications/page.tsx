import type { Metadata } from "next";
import { AlertsTab } from "@/components/notifications/alerts-view";

// No patient details in the title (spec §5).
export const metadata: Metadata = { title: "Notifications · MHAI" };

export default function NotificationsPage() {
  return <AlertsTab />;
}
