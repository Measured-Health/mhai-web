"use client";
import { Suspense } from "react";
import { PrintBody } from "@/components/print/print-body";

// Opened by same-tab navigation, so the in-memory session and query cache
// are still there and nothing is stored.
export default function PrintPage({ params }: PageProps<"/print/[id]">) {
  return (
    <Suspense fallback={null}>
      <PrintBody params={params} />
    </Suspense>
  );
}
