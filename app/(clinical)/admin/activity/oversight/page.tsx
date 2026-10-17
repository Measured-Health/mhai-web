import type { Metadata } from "next";
import { OversightView } from "@/components/admin/oversight-view";

export const metadata: Metadata = { title: "Review oversight · MHAI" };

export default function OversightPage() {
  return <OversightView />;
}
