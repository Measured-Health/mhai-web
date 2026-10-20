import type { Metadata } from "next";
import { StaffView } from "@/components/admin/staff-view";

export const metadata: Metadata = { title: "Staff · MHAI" };

export default function StaffPage() {
  return <StaffView />;
}
