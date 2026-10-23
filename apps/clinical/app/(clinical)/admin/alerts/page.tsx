import type { Metadata } from "next";
import { AlertSettingsView } from "@/components/admin/alert-settings/alert-settings-view";

export const metadata: Metadata = { title: "Alert settings · MHAI" };

export default function AlertSettingsPage() {
  return <AlertSettingsView />;
}
