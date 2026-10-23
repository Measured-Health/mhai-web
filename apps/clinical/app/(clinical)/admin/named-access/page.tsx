import type { Metadata } from "next";
import { NamedAccessView } from "@/components/admin/named-access/named-access-view";

export const metadata: Metadata = { title: "Named access · MHAI" };

export default function NamedAccessPage() {
  return <NamedAccessView />;
}
