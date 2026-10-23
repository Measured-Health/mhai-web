import type { Metadata } from "next";
import { AdminFrame } from "@/components/admin/admin-frame";

export const metadata: Metadata = { title: "Named access · MHAI" };

// The heading only for now: the letters come with the rest of Plan 11.
export default function NamedAccessPage() {
  return <AdminFrame title="Named access">{null}</AdminFrame>;
}
