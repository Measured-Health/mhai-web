import type { Metadata } from "next";
import { SettingsView } from "@/components/admin/settings-view";

export const metadata: Metadata = { title: "Hospital settings · MHAI" };

export default function SettingsPage() {
  return <SettingsView />;
}
