import type { Metadata } from "next";
import { NoAccess } from "@/components/auth/no-access";

export const metadata: Metadata = { title: "No access · MHAI" };

export default function NoAccessPage() {
  return <NoAccess />;
}
