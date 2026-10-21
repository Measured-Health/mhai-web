"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthError } from "@/lib/auth/types";
import { BackupCodes } from "@mhai/ui/auth/backup-codes";
import { AuthErrorBanner, errorCode } from "../auth/auth-error";
import { useNeedsConnection } from "../states/offline-strip";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";

/** Replaces every backup code; the new ones are shown once. */
export function BackupCodesDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const { client, updateUser, signOut } = useAuth();
  const net = useNeedsConnection();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setCodes(null);
    setError(null);
    onClose();
  };
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const fresh = await client.regenerateBackupCodes();
      setCodes(fresh);
      updateUser({ backupCodesLeft: fresh.length });
    } catch (e) {
      const ae = errorCode(e);
      if (ae.code === "session_expired") return void signOut("expired");
      setError(ae);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={close} title="New backup codes">
      {codes ? (
        <BackupCodes codes={codes} onFinish={close} finishLabel="Done" />
      ) : (
        <>
          {error && <AuthErrorBanner error={error} />}
          <p className="mb-[18px] text-[14.5px] text-ink-2">
            Your current backup codes will stop working. You&apos;ll see the new
            ones once, so have somewhere ready to save them.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={busy || net.offline}
              title={net.props.title}
              onClick={() => void make()}
            >
              Get new codes
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
