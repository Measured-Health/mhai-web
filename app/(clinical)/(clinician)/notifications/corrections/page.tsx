import type { Metadata } from "next";
import { CorrectionsTab } from "@/components/notifications/corrections-tab";

export const metadata: Metadata = { title: "Notifications · MHAI" };

export default function NotificationsCorrectionsPage() {
  return <CorrectionsTab />;
}
