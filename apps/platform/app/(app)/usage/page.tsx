import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Usage" };

export default function UsagePage() {
  return (
    <Suspense>
      <AnalyticsView />
    </Suspense>
  );
}
