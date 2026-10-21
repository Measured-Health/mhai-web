"use client";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthHeading } from "./auth-layout";
import { BackupCodes } from "@mhai/ui/auth/backup-codes";
import { CodeInput, normalizeCode } from "@mhai/ui/auth/code-input";
import { QrCode } from "@mhai/ui/auth/qr-code";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";

export type MfaPhase = "setup" | "codes";
const grouped = (s: string) => s.match(/.{1,4}/g)?.join(" ") ?? s;

/** Enrol an authenticator app, then show the backup codes once (7b, 7c). */
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
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  if (phase === "codes" && setup.data)
    return (
      <BackupCodes
        eyebrow={eyebrow?.("codes")}
        codes={setup.data.backupCodes}
        onFinish={onDone}
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
        backupCodesLeft: setup.data?.backupCodes.length ?? null,
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
      <div className="mb-4 flex items-start gap-4">
        {setup.data && (
          <div className="flex-none rounded-2xl border border-lilac-2 bg-white p-2">
            <QrCode
              text={setup.data.otpauthUri}
              label="QR code for your authenticator app"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2 pt-1">
          <ol className="flex list-decimal flex-col gap-1 pl-4 text-[13px] text-ink-2 marker:font-bold marker:text-ink">
            <li>
              Open Google Authenticator, Microsoft Authenticator or similar
            </li>
            <li>Scan this code</li>
            <li>Enter the 6-digit code below</li>
          </ol>
          {setup.data && (
            <button
              type="button"
              aria-expanded={showKey}
              className="min-h-11 self-start text-[13px] font-semibold text-mint-deep"
              onClick={() => setShowKey((v) => !v)}
            >
              Can&apos;t scan? Show key
            </button>
          )}
        </div>
      </div>
      {setup.data && showKey && (
        <p className="mb-4 break-all rounded-xl bg-bg px-3 py-2 font-mono text-[15px] tracking-wider">
          {grouped(setup.data.secret)}
        </p>
      )}
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
