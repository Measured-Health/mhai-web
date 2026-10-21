"use client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { NOT_PLATFORM } from "./auth-error";

/** "This account can't use the platform admin app." */
export function NoAccess() {
  return (
    <main className="canvas-v3 grid min-h-full place-items-center p-6 text-center">
      <div className="card-v3 max-w-md p-8">
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-20 place-items-center rounded-[26px] bg-lilac text-bloom"
        >
          <Lock className="size-8" />
        </div>
        <h1 className="font-display text-[40px] font-black leading-none text-ink">
          You don&apos;t have access
        </h1>
        <p className="mx-auto mt-3 max-w-[380px] font-semibold text-ink">
          {NOT_PLATFORM}
        </p>
        <p className="mx-auto mt-1.5 max-w-[380px] leading-relaxed text-ink-2">
          It&apos;s for Measured Health platform admins and auditors. Hospital
          staff use the MHAI app.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-bloom underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom"
        >
          Sign in with another account
        </Link>
      </div>
    </main>
  );
}

/** /no-access: the same content; any session here is ended. */
export function NoAccessPage() {
  const { status, refuse } = useAuth();
  useEffect(() => {
    if (status === "signed_in") void refuse();
  }, [status, refuse]);
  return <NoAccess />;
}
