"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { useRedirect } from "@/lib/auth/use-redirect";
import type { AuthError } from "@/lib/auth/types";
import {
  BACKUP_FAILED_BODY,
  BackupCodeInput,
  useCodeOrBackup,
} from "@mhai/ui/auth/backup-code-toggle";
import { CodeInput } from "@mhai/ui/auth/code-input";
import { Button } from "@mhai/ui/button";
import { AuthErrorBanner, errorCode } from "./auth-error";
import { AuthHeading } from "./auth-layout";

const BACKUP_FAILED = {
  title: "That backup code didn't work.",
  body: BACKUP_FAILED_BODY,
};

/** The two-step code at every sign-in. There is no "trust this device". */
export function CodeForm() {
  const auth = useAuth();
  const router = useRouter();
  const id = useId();
  const { code, setCode, backup, setBackup, ready, value } = useCodeOrBackup();
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);
  // After the error banner has taken focus (a child effect runs first), the
  // backup field takes it back, so the next code can be typed at once.
  useEffect(() => {
    if (focusKey && backup) backupRef.current?.focus();
  }, [focusKey, backup]);

  const target =
    auth.status === "signed_in"
      ? homeFor(auth)
      : auth.status === "signed_out" && !auth.mfaPending
        ? "/sign-in"
        : null;
  useRedirect(target);
  if (auth.status === "loading" || target) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Signed in: home. Turned away (not_platform): signed out, and the
      // sign-in page says why.
      await auth.verifyCode(value, { backup });
    } catch (err) {
      const ae = errorCode(err);
      setError(ae);
      // Whatever went wrong, the code is never left on screen to resend.
      setCode("");
      setFocusKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const wrongBackup = error?.code === "mfa_invalid" && backup;
  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow="Two-step verification"
        title="Enter your code"
        sub={
          backup
            ? "Enter one of the backup codes you saved when you set up two-step verification. Each works once."
            : "Enter the 6-digit code from your authenticator app"
        }
      />
      {error && (
        <AuthErrorBanner
          error={error}
          copy={wrongBackup ? BACKUP_FAILED : undefined}
        >
          {error.code === "mfa_expired" && (
            <Link
              className="mt-1.5 inline-block font-semibold underline"
              href="/sign-in"
            >
              Sign in again
            </Link>
          )}
        </AuthErrorBanner>
      )}
      {backup ? (
        <BackupCodeInput
          id={`${id}-backup`}
          inputRef={backupRef}
          value={code}
          onChange={setCode}
          disabled={busy}
        />
      ) : (
        <CodeInput
          autoSubmit
          value={code}
          onChange={setCode}
          label="Code from your app"
          disabled={busy}
          invalid={error?.code === "mfa_invalid"}
          focusKey={focusKey}
        />
      )}
      <Button type="submit" className="mt-4 w-full" disabled={!ready || busy}>
        {busy ? "Checking…" : "Verify"}
      </Button>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-ink-3">
        <button
          type="button"
          className="min-h-11 font-semibold text-mint-deep"
          onClick={() => {
            setBackup(!backup);
            setError(null);
          }}
        >
          {backup ? "Use your app instead" : "Use a backup code instead"}
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          className="min-h-11 text-mint-deep"
          onClick={() => {
            auth.cancelMfa();
            router.replace("/sign-in");
          }}
        >
          Back to sign in
        </button>
      </p>
    </form>
  );
}
