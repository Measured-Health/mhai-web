import type { Metadata } from "next";
import { NoAccessPage } from "@/components/auth/no-access";

export const metadata: Metadata = { title: "No access" };

export default function Page() {
  return <NoAccessPage />;
}
