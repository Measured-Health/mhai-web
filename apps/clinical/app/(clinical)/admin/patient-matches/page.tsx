import type { Metadata } from "next";
import { MatchesView } from "@/components/admin/patients/matches-view";

export const metadata: Metadata = { title: "Patient matches · MHAI" };

export default function PatientMatchesPage() {
  return <MatchesView />;
}
