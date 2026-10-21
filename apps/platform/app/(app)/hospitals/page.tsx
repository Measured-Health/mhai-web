import type { Metadata } from "next";
import { TopBar } from "@/components/shell/top-bar";

export const metadata: Metadata = { title: "Hospitals" };

// A placeholder until the hospital list lands (Plan 7b, Task 9).
export default function HospitalsPage() {
  return <TopBar title="Hospitals" />;
}
