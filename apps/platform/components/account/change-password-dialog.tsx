"use client";
import { useId, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { passwordError } from "@mhai/api-client/password-rules";
import { inputClass, PasswordFields } from "@mhai/ui/auth/password-fields";
import { AuthErrorBanner, errorCode } from "../auth/auth-error";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";

export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const { client, user, signOut } = useAuth();
  const toast = useToast();
  const net = useNeedsConnection("pw-offline");
  const id = useId();
  const identity = user?.email ?? null;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShowErrors(false);
    setError(null);
    onClose();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!current || passwordError(next, confirm, identity) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await client.changePassword(current, next);
      close();
      toast.show({ title: "Password changed", tone: "ok" });
    } catch (err) {
      const ae = errorCode(err);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  const wrong = error?.code === "wrong_password";

  return (
    <Dialog open={open} onClose={close} title="Change your password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {error && !wrong && <AuthErrorBanner error={error} />}
        <div>
          <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-ink-2">
            Current password
          </label>
          <input
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
              That isn&apos;t your current password.
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
        <OfflineNote id="pw-offline" />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" {...net.props} disabled={busy || net.offline}>
            Save password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
