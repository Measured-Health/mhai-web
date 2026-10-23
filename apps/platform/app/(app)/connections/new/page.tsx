import type { Metadata } from "next";
import { Suspense } from "react";
import { AddConnectionView } from "@/components/emr/add-connection-view";

export const metadata: Metadata = { title: "Add a connection" };

export default function NewConnectionPage() {
  return (
    <Suspense>
      <AddConnectionView />
    </Suspense>
  );
}
