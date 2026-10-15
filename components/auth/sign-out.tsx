"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";

/** /sign-out: reached through the shell guard, so drafts are asked about first. */
export function SignOut() {
  const { status, signOut } = useAuth();
  const router = useRouter();
  // signOut already lands on /sign-in; don't send a second replace after it.
  const started = useRef(false);
  useEffect(() => {
    if (status === "signed_in") {
      started.current = true;
      void signOut("manual");
    } else if (status === "signed_out" && !started.current) {
      router.replace("/sign-in");
    }
  }, [status, signOut, router]);
  return null;
}
