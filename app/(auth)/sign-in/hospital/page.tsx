import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestGate } from "@/components/auth/guest-gate";
import { HospitalReturn } from "@/components/auth/hospital-return";

export const metadata: Metadata = { title: "Signing in · MHAI" };

export default function HospitalReturnPage() {
  return (
    <GuestGate>
      <Suspense fallback={null}>
        <HospitalReturn />
      </Suspense>
    </GuestGate>
  );
}
