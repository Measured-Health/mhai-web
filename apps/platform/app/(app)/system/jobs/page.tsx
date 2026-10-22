import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsView } from "@/components/system/jobs-view";
import { TopBar } from "@/components/shell/top-bar";

export const metadata: Metadata = { title: "Failed jobs" };

// Until the System layout (Task 7) frames the tabs, the page frames itself.
export default function JobsPage() {
  return (
    <>
      <TopBar title="System" sub="Health and failed jobs" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto max-w-[1100px]">
          <Suspense>
            <JobsView />
          </Suspense>
        </div>
      </div>
    </>
  );
}
