"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError } from "@/lib/auth/types";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";
import { AuthHeading } from "./auth-layout";

/** /sign-in/hospital?code=…: where hospital sign-on hands back to MHAI. */
export function HospitalReturn() {
  const { completeHospitalSignIn } = useAuth();
  const params = useSearchParams();
  const [code] = useState(() => params.get("code"));
  const [error, setError] = useState<AuthError | null>(() =>
    code ? null : new AuthError("sso_failed"),
  );
  const started = useRef(false);

  useEffect(() => {
    // The code is single-use; keep it out of history and the address bar.
    if (window.location.search)
      window.history.replaceState(
        window.history.state,
        "",
        "/sign-in/hospital",
      );
  }, []);
  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    completeHospitalSignIn(code).catch((e) => setError(errorCode(e)));
  }, [code, completeHospitalSignIn]);

  if (!error)
    return (
      <p role="status" className="text-center text-[14.5px] text-ink-2">
        Signing you in…
      </p>
    );
  return (
    <>
      <AuthHeading title="Hospital sign-in" />
      <AuthErrorBanner error={error} />
      <p className="mt-6 text-center text-[13px]">
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center text-mint-deep"
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}
