"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { passwordError } from "@mhai/api-client/password-rules";
import type { AuthError } from "@/lib/auth/types";
import { Button } from "@mhai/ui/button";
import { AuthHeading } from "./auth-layout";
import { inputClass, PasswordFields } from "@mhai/ui/auth/password-fields";
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
  const id = useId();
  const identity = user?.email ?? user?.username ?? null;
  // The temporary password again: the server needs it to change it.
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!current) return void currentRef.current?.focus();
    if (passwordError(next, confirm, identity) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.changePassword(current, next);
      setCurrent("");
      onDone();
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
      if (ae.code === "wrong_password") {
        setCurrent("");
        currentRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };
  const wrong = error?.code === "wrong_password";
  return (
    <form onSubmit={submit} noValidate>
      <AuthHeading
        eyebrow={eyebrow}
        title="Choose a new password"
        sub="Your hospital gave you a temporary password. Enter it once more, then choose your own."
      />
      {error && !wrong && (
        <AuthErrorBanner
          error={error}
          copy={error.code === "weak_password" ? WEAK_COPY : undefined}
        />
      )}
      <div className="mb-3">
        <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-ink-2">
          Temporary password
        </label>
        <input
          ref={currentRef}
          id={id}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={wrong || (showErrors && !current) || undefined}
          aria-describedby={wrong ? `${id}-err` : undefined}
          className={inputClass}
        />
        {wrong && (
          <p id={`${id}-err`} className="mt-1 text-[13px] text-bad">
            That isn&apos;t the temporary password you were given.
          </p>
        )}
      </div>
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
