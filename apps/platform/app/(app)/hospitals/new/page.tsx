import type { Metadata } from "next";
import { AddHospitalForm } from "@/components/hospitals/add-hospital-form";

export const metadata: Metadata = { title: "Add hospital" };

export default function NewHospitalPage() {
  return <AddHospitalForm />;
}
