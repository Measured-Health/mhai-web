"use client";
import { Suspense, use } from "react";
import { ConsultationView } from "@/components/consultation/consultation-view";

// With cacheComponents, reading params must sit inside <Suspense>.
function Body({ params }: { params: Promise<{ id: string }> }) {
  return <ConsultationView id={use(params).id} />;
}

export default function ConsultationPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}
