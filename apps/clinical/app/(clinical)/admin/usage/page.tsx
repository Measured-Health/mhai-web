import type { Metadata } from "next";
import { UsageView } from "@/components/admin/usage-view";

export const metadata: Metadata = { title: "Usage · MHAI" };

export default function UsagePage() {
  return <UsageView />;
}
