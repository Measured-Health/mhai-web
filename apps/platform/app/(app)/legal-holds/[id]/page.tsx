import type { Metadata } from "next";
import { HoldView } from "@/components/holds/hold-view";

export const metadata: Metadata = { title: "Legal hold" };

export default async function LegalHoldPage({
  params,
}: PageProps<"/legal-holds/[id]">) {
  const { id } = await params;
  return <HoldView id={id} />;
}
