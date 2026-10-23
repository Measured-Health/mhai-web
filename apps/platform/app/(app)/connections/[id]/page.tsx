import type { Metadata } from "next";
import { ConnectionView } from "@/components/emr/connection-view";

export const metadata: Metadata = { title: "Connection" };

export default async function ConnectionPage({
  params,
}: PageProps<"/connections/[id]">) {
  const { id } = await params;
  return <ConnectionView id={id} />;
}
