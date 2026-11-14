import type { Metadata } from "next";
import { ExclusionView } from "@/components/admin/patients/exclusion-view";

export const metadata: Metadata = { title: "Patient exclusions · MHAI" };

export default function PatientExclusionsPage() {
  return <ExclusionView />;
}
