"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/auth-context";

/** /sign-out: ends the session (signOut goes to /sign-in itself). */
export function SignOut() {
  const { status, signOut } = useAuth();
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (status === "signed_in") {
      if (started.current) return;
      started.current = true;
      void signOut("manual");
    } else if (status === "signed_out" && !started.current) {
      router.replace("/sign-in");
    }
  }, [status, signOut, router]);
  return null;
}
