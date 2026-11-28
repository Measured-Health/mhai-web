"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@mhai/api-client/password-rules";
import type { AuthError, PasswordSaved } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthErrorBanner } from "./auth-error-banner";
import { AuthHeading } from "./auth-layout";
import { BackToSignIn } from "./forgot-password";
import { WEAK_COPY } from "./new-password-step";
import { PasswordFields } from "@mhai/ui/auth/password-fields";
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
  const [done, setDone] = useState<PasswordSaved | null>(null);

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

  if (done?.app === "platform")
    return (
      <>
        <div
          aria-hidden
          className="mb-4 grid size-14 place-items-center rounded-2xl bg-ok-wash text-ok-deep"
        >
          <CheckCircle2 className="size-6" />
        </div>
        <AuthHeading
          title="Password saved"
          sub={
            done.signInUrl
              ? "Sign in to the platform admin app with your new password. You'll set up two-step verification there next."
              : "Sign in to the platform admin app with your new password. You'll set up two-step verification there next. Ask the person who invited you for its address."
          }
        />
        {done.signInUrl && (
          <a
            href={done.signInUrl}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-br from-mint to-mint-deep px-5 text-sm font-semibold text-white"
          >
            Go to the platform admin sign-in
          </a>
        )}
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
          title="Password saved"
          sub="Sign in with your new password. If you were invited, you'll set up two-step verification next; otherwise you'll still need your authenticator app."
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
      setDone(await client.resetPassword(token, next));
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
          body: "Reset links work once, for 30 minutes. Invite links work for 3 days: ask your hospital admin for a new invite.",
        }
      : error?.code === "weak_password"
        ? WEAK_COPY
        : undefined;

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        title="Choose your password"
        sub="For a password reset, or to finish joining when you were invited."
      />
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
        Save password
      </Button>
      <p className="mt-3 text-center text-[13px] text-ink-3">
        You&apos;ll be signed out of any other devices.
      </p>
    </form>
  );
}
