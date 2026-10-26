import type { Metadata } from "next";
import { AnalysisGate } from "@/components/analysis/analysis-gate";

export const metadata: Metadata = { title: "Analysis" };

export default function AnalysisPage() {
  return <AnalysisGate />;
}
