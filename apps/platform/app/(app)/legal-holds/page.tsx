import type { Metadata } from "next";
import { Suspense } from "react";
import { HoldsView } from "@/components/holds/holds-view";

export const metadata: Metadata = { title: "Legal holds" };

export default function LegalHoldsPage() {
  return (
    <Suspense>
      <HoldsView />
    </Suspense>
  );
}
