import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsView } from "@/components/system/jobs-view";

export const metadata: Metadata = { title: "Failed jobs" };

export default function JobsPage() {
  return (
    <Suspense>
      <JobsView />
    </Suspense>
  );
}
