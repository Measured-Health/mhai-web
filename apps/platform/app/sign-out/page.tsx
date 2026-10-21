import type { Metadata } from "next";
import { SignOut } from "@/components/auth/sign-out";

export const metadata: Metadata = { title: "Signing out" };

export default function SignOutPage() {
  return <SignOut />;
}
