import type { Metadata } from "next";
import { HospitalPlaceholder } from "@/components/hospitals/hospital-placeholder";

export const metadata: Metadata = { title: "Hospital" };

// A placeholder until the hospital page lands (Plan 7b, Task 10).
export default async function HospitalPage({
  params,
}: PageProps<"/hospitals/[id]">) {
  const { id } = await params;
  return <HospitalPlaceholder id={id} />;
}
