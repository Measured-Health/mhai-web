import type { Metadata } from "next";
import { HospitalsView } from "@/components/hospitals/hospitals-view";

export const metadata: Metadata = { title: "Hospitals" };

export default function HospitalsPage() {
  return <HospitalsView />;
}
