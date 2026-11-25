"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminError } from "@/lib/admin/errors";
import { stepUpBody } from "@/lib/api/admin-contract";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import type { MfaReplace } from "@/lib/auth/types";
import {
  useConfirmMfaReplace,
  useStartMfaReplace,
} from "@/lib/mfa-replace-queries";
import { useNetwork } from "@mhai/api-client/network";
import { CodeInput, normalizeCode } from "@mhai/ui/auth/code-input";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { StepUpDialog } from "../admin/step-up-fields";
import { ScanApp } from "../auth/scan-app";

export const MOVE_TITLE = "Move to a new authenticator app";
export const TOO_LONG = "That took too long. Start again.";

const words = (title: string, body: string): AdminError => ({
  title,
  body,
  gone: false,
  stale: false,
  unavailable: false,
  saved: false,
});

/** Plain words for a refusal while moving to a new app; never a code. */
export function moveError(e: unknown): AdminError {
  if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500)
    return words("Couldn't reach MHAI", "Check your connection and try again.");
  switch (e.code) {
    case "mfa_invalid":
      return words(
        "That code didn't work.",
        "Check your authenticator app and try the newest code.",
      );
    case "mfa_locked":
      return words(
        "Too many wrong codes. Try again in 15 minutes.",
        "For your security, codes are paused for this account.",
      );
    case "conflict":
      return words(
        TOO_LONG,
        "Nothing has changed: your current app still works.",
      );
    case "rate_limited":
      return words(
        "Too many tries right now.",
        "Wait a minute, then try again.",
      );
  }
  return words("Something went wrong.", "Try again.");
}

const sessionEnded = (e: unknown) => e instanceof ApiError && e.status === 401;

/**
 * Moves two-step to a new authenticator app: the current code or a backup
 * code, then the new app's QR code and key, then a code from the new app.
 * Mounted only while open, so every opening starts empty; the new key lives
 * in this component's state only and is dropped the moment the move ends,
 * is cancelled or runs out of time.
 */
export function MoveAppDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return open ? <MoveApp onClose={onClose} /> : null;
}

type Phase = "check" | "scan" | "expired" | "done";

function MoveApp({ onClose }: { onClose(): void }) {
  const { signOut } = useAuth();
  const { online } = useNetwork();
  const start = useStartMfaReplace();
  const confirm = useConfirmMfaReplace();
  const [phase, setPhase] = useState<Phase>("check");
  const [setup, setSetup] = useState<MfaReplace | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<AdminError | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // One confirmation sends one request, even if a click and the last digit
  // land before the next render.
  const sending = useRef(false);
  const busy = confirm.isPending;

  // After the dialog's own focus move: the code box, or the next step.
  useEffect(() => {
    box.current
      ?.querySelector<HTMLElement>("[data-autofocus], input:not([disabled])")
      ?.focus();
  }, [phase]);

  const close = () => {
    setSetup(null);
    setCode("");
    start.reset();
    confirm.reset();
    onClose();
  };
  const again = () => {
    setSetup(null);
    setCode("");
    setError(null);
    setPhase("check");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = normalizeCode(code);
    if (digits.length !== 6 || busy || sending.current || !online) return;
    sending.current = true;
    setError(null);
    confirm.mutate(digits, {
      onSuccess: () => {
        confirm.reset();
        setSetup(null);
        setCode("");
        setPhase("done");
      },
      onError: (err) => {
        confirm.reset();
        if (sessionEnded(err)) return void signOut("expired");
        if (err instanceof ApiError && err.code === "conflict") {
          // Nothing waits any more: the key is no use, so it goes now.
          setSetup(null);
          setCode("");
          return setPhase("expired");
        }
        setError(moveError(err));
        setCode("");
        setFocusKey((k) => k + 1);
      },
      onSettled: () => {
        sending.current = false;
      },
    });
  };

  if (phase === "check")
    return (
      <StepUpDialog
        title={MOVE_TITLE}
        keepLabel="Cancel"
        confirmLabel="Continue"
        confirmVariant="primary"
        blockedTitle="Turn on two-step verification first."
        offline={!online}
        send={async (auth) => {
          try {
            setSetup(await start.mutateAsync(stepUpBody(auth)));
          } catch (e) {
            if (sessionEnded(e)) void signOut("expired");
            throw e;
          }
        }}
        reset={start.reset}
        onKeep={close}
        onDone={() => setPhase("scan")}
        explain={moveError}
      >
        <p>
          Use this when you get a new phone or want to use a different
          authenticator app. Your current app keeps working until you finish.
        </p>
      </StepUpDialog>
    );

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={MOVE_TITLE}
    >
      <div ref={box}>
        {phase === "done" ? (
          <>
            <Banner tone="ok" title="Your new app is set up.">
              Your old app no longer works. Remembered devices have been signed
              out; your backup codes haven&apos;t changed.
            </Banner>
            <div className="mt-5 flex justify-end">
              <Button data-autofocus onClick={close}>
                Done
              </Button>
            </div>
          </>
        ) : phase === "expired" || !setup ? (
          <>
            <Banner tone="bad" title={TOO_LONG}>
              Nothing has changed: your current app still works.
            </Banner>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button data-autofocus onClick={again}>
                Start again
              </Button>
            </div>
          </>
        ) : (
          <form noValidate onSubmit={submit}>
            <p className="mb-4 text-[14px] text-ink-2">
              Add MHAI to your new app, then enter the code it shows. Until you
              do, your current app keeps working.
            </p>
            <ScanApp setup={setup} />
            {error && (
              <div className="mb-4">
                <Banner tone="bad" title={error.title}>
                  {error.body}
                </Banner>
              </div>
            )}
            <p className="mb-1.5 text-[12.5px] text-ink-2" aria-hidden>
              Code from your new app
            </p>
            <CodeInput
              autoSubmit
              value={code}
              onChange={setCode}
              label="Code from your new app"
              disabled={busy}
              invalid={error !== null}
              focusKey={focusKey}
            />
            {!online && (
              <p className="mt-3 text-[13px] text-ink-3">
                You&apos;re offline. This needs a connection.
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={normalizeCode(code).length !== 6 || busy || !online}
              >
                {busy ? "Checking…" : "Verify and finish"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
