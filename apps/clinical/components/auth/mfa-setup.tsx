"use client";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthHeading } from "./auth-layout";
import { SaveBackupCode } from "@mhai/ui/auth/save-backup-code";
import { CodeInput, normalizeCode } from "@mhai/ui/auth/code-input";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";
import { ScanApp } from "./scan-app";

export type MfaPhase = "setup" | "codes";

/** Enrol an authenticator app, then show the backup code once (7b, 7c). */
export function MfaSetup({
  onDone,
  eyebrow,
}: {
  onDone(): void;
  /** Eyebrow per phase, e.g. "Step 3 of 4 · Protect your account". */
  eyebrow?: (p: MfaPhase) => string | undefined;
}) {
  const { client, updateUser, signOut } = useAuth();
  const setup = useQuery({
    queryKey: ["mfa-setup"],
    queryFn: () => client.startMfaSetup(),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [phase, setPhase] = useState<MfaPhase>("setup");
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  if (phase === "codes" && setup.data)
    return (
      <SaveBackupCode
        page
        kind="setup"
        eyebrow={eyebrow?.("codes")}
        code={setup.data.backupCode}
        continueLabel="Finish setup"
        onContinue={onDone}
      />
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (normalizeCode(code).length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.confirmMfaSetup(normalizeCode(code));
      updateUser({
        mfaEnabled: true,
        backupCodesLeft: setup.data ? 1 : null,
      });
      setPhase("codes");
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
      setCode("");
      setFocusKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow={eyebrow?.("setup")}
        title="Set up two-step verification"
        sub="Required for everyone. It protects patient data if your password is ever leaked."
      />
      {error && <AuthErrorBanner error={error} />}
      {setup.isError && (
        <AuthErrorBanner
          error={new AuthError("unavailable")}
          copy={{
            title: "We couldn't start the setup.",
            body: "Check your connection and try again.",
          }}
        >
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => void setup.refetch()}
          >
            Try again
          </Button>
        </AuthErrorBanner>
      )}
      <ScanApp setup={setup.data} />
      <p className="mb-1.5 text-[12.5px] text-ink-2" aria-hidden>
        Code from your app
      </p>
      <CodeInput
        autoSubmit
        value={code}
        onChange={setCode}
        label="Code from your app"
        disabled={busy || !setup.data}
        invalid={error?.code === "mfa_invalid"}
        focusKey={focusKey}
      />
      <Button
        type="submit"
        className="mt-4 w-full"
        disabled={normalizeCode(code).length !== 6 || busy || !setup.data}
      >
        {busy ? "Checking…" : "Verify and continue"}
      </Button>
    </form>
  );
}
