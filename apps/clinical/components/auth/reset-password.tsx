"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@mhai/api-client/password-rules";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "../ui/button";
import { AuthErrorBanner } from "./auth-error-banner";
import { AuthHeading } from "./auth-layout";
import { BackToSignIn } from "./forgot-password";
import { WEAK_COPY } from "./new-password-step";
import { PasswordFields } from "./password-fields";
import { errorCode } from "./auth-error-copy";

export function ResetPassword() {
  const { client } = useAuth();
  const params = useSearchParams();
  // Read once; the address bar is cleaned below.
  const [token] = useState(() => params.get("token"));
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.location.search)
      window.history.replaceState(window.history.state, "", "/reset-password");
  }, []);

  if (!token)
    return (
      <>
        <AuthHeading
          title="Reset your password"
          sub="This link is missing or incomplete."
        />
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center font-semibold text-mint-deep"
        >
          Send a new link
        </Link>
        <BackToSignIn />
      </>
    );

  if (done)
    return (
      <>
        <div
          aria-hidden
          className="mb-4 grid size-14 place-items-center rounded-2xl bg-ok-wash text-ok-deep"
        >
          <CheckCircle2 className="size-6" />
        </div>
        <AuthHeading
          title="Password updated"
          sub="You've been signed out everywhere else. Sign in with your new password. You'll still need your authenticator app."
        />
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-br from-mint to-mint-deep px-5 text-sm font-semibold text-white"
        >
          Back to sign in
        </Link>
      </>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (passwordError(next, confirm, null) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.resetPassword(token, next);
      setDone(true);
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };
  const copy =
    error?.code === "link_expired"
      ? {
          title: "This link has expired or was already used.",
          body: "Reset links work once, for 30 minutes.",
        }
      : error?.code === "weak_password"
        ? WEAK_COPY
        : undefined;

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading title="Choose a new password" />
      {error && (
        <AuthErrorBanner error={error} copy={copy}>
          {error.code === "link_expired" && (
            <Link
              href="/forgot-password"
              className="inline-flex min-h-11 items-center font-semibold underline"
            >
              Send a new link
            </Link>
          )}
        </AuthErrorBanner>
      )}
      <PasswordFields
        next={next}
        confirm={confirm}
        onNext={setNext}
        onConfirm={setConfirm}
        identity={null}
        showErrors={showErrors}
      />
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        Save new password
      </Button>
      <p className="mt-3 text-center text-[13px] text-ink-3">
        You&apos;ll be signed out of all other devices.
      </p>
    </form>
  );
}
