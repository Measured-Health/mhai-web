"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { homeFor, useAuth } from "@/lib/auth/auth-context";
import { normalizeBackupCode } from "@/lib/auth/codes";
import { useRedirect } from "@/lib/auth/use-redirect";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "../ui/button";
import { AuthHeading } from "./auth-layout";
import { CodeInput, normalizeCode } from "./code-input";
import { inputClass } from "./password-fields";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";

const BACKUP_FAILED = {
  title: "That backup code didn't work.",
  body: "Check it, or it may have been used already. Each code works once.",
};

export function CodeForm() {
  const auth = useAuth();
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const backupRef = useRef<HTMLInputElement>(null);

  const target =
    auth.status === "signed_in"
      ? homeFor(auth)
      : auth.status === "signed_out" && !auth.mfaPending
        ? "/sign-in"
        : null;
  useRedirect(target);
  if (auth.status === "loading" || target) return null;

  const ready = backup ? code.length === 9 : normalizeCode(code).length === 6;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCode(backup ? code : normalizeCode(code), {
        backup,
        trustDevice: trust,
      });
    } catch (err) {
      const ae = errorCode(err);
      setError(ae);
      if (ae.code === "mfa_invalid") {
        setCode("");
        if (backup) backupRef.current?.focus();
        else setFocusKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow="Two-step verification"
        title="Enter your code"
        sub={
          backup
            ? "Enter one of the backup codes you saved when you set up two-step verification."
            : "Open your authenticator app and enter the 6-digit code for MHAI."
        }
      />
      {error && (
        <AuthErrorBanner
          error={error}
          copy={
            error.code === "mfa_invalid" && backup ? BACKUP_FAILED : undefined
          }
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
        <div>
          <label
            htmlFor={`${id}-backup`}
            className="mb-1.5 block text-[12.5px] text-ink-2"
          >
            Backup code
          </label>
          <input
            ref={backupRef}
            id={`${id}-backup`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            maxLength={9}
            value={code}
            onChange={(e) => setCode(normalizeBackupCode(e.target.value))}
            className={`${inputClass} font-mono`}
          />
        </div>
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
      {auth.capabilities.trustDevice && (
        <label className="mt-4 flex min-h-11 items-center gap-2.5 text-[13.5px]">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="size-4 accent-mint-deep"
          />
          Trust this device for 30 days
        </label>
      )}
      <Button type="submit" className="mt-4 w-full" disabled={!ready || busy}>
        {busy ? "Checking…" : "Verify"}
      </Button>
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-ink-3">
        {backup ? (
          <button
            type="button"
            className="min-h-11 text-mint-deep"
            onClick={() => {
              setBackup(false);
              setCode("");
              setError(null);
            }}
          >
            Use your app instead
          </button>
        ) : (
          <>
            Lost your phone?
            <button
              type="button"
              className="min-h-11 text-mint-deep"
              onClick={() => {
                setBackup(true);
                setCode("");
                setError(null);
              }}
            >
              Use a backup code
            </button>
          </>
        )}
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
