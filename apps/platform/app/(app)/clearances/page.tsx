import type { Metadata } from "next";
import { ClearancesView } from "@/components/clearances/clearances-view";

// The root layout's template adds " · MHAI Platform".
export const metadata: Metadata = { title: "Clearances" };

export default function ClearancesPage() {
  return <ClearancesView />;
}
