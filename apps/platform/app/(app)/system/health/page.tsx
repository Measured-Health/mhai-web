import type { Metadata } from "next";
import { HealthView } from "@/components/system/health-view";

export const metadata: Metadata = { title: "System health" };

export default function HealthPage() {
  return <HealthView />;
}
