import type { Metadata } from "next";
import { TopBar } from "@/components/shell/top-bar";

export const metadata: Metadata = { title: "Activity" };

// A placeholder until the activity screen lands (Plan 7b, Task 14).
export default function ActivityPage() {
  return <TopBar title="Activity" />;
}
