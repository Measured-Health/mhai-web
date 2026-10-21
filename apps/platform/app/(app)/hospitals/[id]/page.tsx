import type { Metadata } from "next";
import { HospitalView } from "@/components/hospitals/hospital-view";

export const metadata: Metadata = { title: "Hospital" };

export default async function HospitalPage({
  params,
}: PageProps<"/hospitals/[id]">) {
  const { id } = await params;
  return <HospitalView id={id} />;
}
