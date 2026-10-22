import type { Metadata } from "next";
import { AnalysisView } from "@/components/analysis/analysis-view";

// Static: the filters and the chosen view never reach the title (spec §6).
export const metadata: Metadata = { title: "Analysis · MHAI" };

export default function AnalysisPage() {
  return <AnalysisView />;
}
