import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestGate } from "@/components/auth/guest-gate";
import { ResetPassword } from "@/components/auth/reset-password";

export const metadata: Metadata = { title: "Choose a new password · MHAI" };

export default function ResetPasswordPage() {
  return (
    <GuestGate>
      <Suspense fallback={null}>
        <ResetPassword />
      </Suspense>
    </GuestGate>
  );
}
