"use client";
import { Suspense, use } from "react";
import { ConsultationView } from "@/components/consultation/consultation-view";

// Reading params sits inside <Suspense>, so the page streams while it waits.
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
