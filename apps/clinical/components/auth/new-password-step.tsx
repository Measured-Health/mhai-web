"use client";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@mhai/api-client/password-rules";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthHeading } from "./auth-layout";
import { PasswordFields } from "@mhai/ui/auth/password-fields";
import { AuthErrorBanner } from "./auth-error-banner";
import { errorCode } from "./auth-error-copy";

export const WEAK_COPY = {
  title: "Choose a stronger password",
  body: "That one is too common or has appeared in a leak. Try another.",
};

export function NewPasswordStep({
  eyebrow,
  onDone,
}: {
  eyebrow: string;
  onDone(): void;
}) {
  const { client, user, signOut } = useAuth();
  const identity = user?.email ?? user?.username ?? null;
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
        sub="Your hospital gave you a temporary password. Choose your own to continue."
      />
      {error && (
        <AuthErrorBanner
          error={error}
          copy={error.code === "weak_password" ? WEAK_COPY : undefined}
        />
      )}
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
