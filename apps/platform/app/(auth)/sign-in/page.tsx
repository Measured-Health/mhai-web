import type { Metadata } from "next";
import { GuestGate } from "@/components/auth/guest-gate";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <GuestGate>
      <SignInForm />
    </GuestGate>
  );
}
