import type { Metadata } from "next";
import { ForgotPassword } from "@/components/auth/forgot-password";
import { GuestGate } from "@/components/auth/guest-gate";

export const metadata: Metadata = { title: "Reset your password · MHAI" };

export default function ForgotPasswordPage() {
  return (
    <GuestGate>
      <ForgotPassword />
    </GuestGate>
  );
}
