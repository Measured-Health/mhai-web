import type { Metadata } from "next";
import { TopBar } from "@/components/shell/top-bar";

export const metadata: Metadata = { title: "Team" };

// A placeholder until the team screen lands (Plan 7b, Task 13).
export default function TeamPage() {
  return <TopBar title="Team" />;
}
