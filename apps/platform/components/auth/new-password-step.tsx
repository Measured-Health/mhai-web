"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { passwordError } from "@mhai/api-client/password-rules";
import { PasswordFields } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { AuthErrorBanner, errorCode } from "./auth-error";
import { AuthHeading } from "./auth-layout";

export function NewPasswordStep({
  eyebrow,
  onDone,
}: {
  eyebrow: string;
  onDone(): void;
}) {
  const { client, user, signOut } = useAuth();
  const identity = user?.email ?? null;
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (passwordError(next, confirm, identity) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.changePassword(null, next);
      onDone();
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow={eyebrow}
        title="Choose a new password"
        sub="You were given a temporary password. Choose your own to continue."
      />
      {error && <AuthErrorBanner error={error} />}
      <PasswordFields
        next={next}
        confirm={confirm}
        onNext={setNext}
        onConfirm={setConfirm}
        identity={identity}
        showErrors={showErrors}
      />
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        Save password
      </Button>
    </form>
  );
}
