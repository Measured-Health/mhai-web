"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import type { MfaReplace } from "@/lib/auth/types";
import { platformError } from "@/lib/errors";
import {
  useConfirmMfaReplace,
  useStartMfaReplace,
} from "@/lib/queries/mfa-replace";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { ApiError } from "@mhai/api-client/errors";
import { CodeInput, normalizeCode } from "@mhai/ui/auth/code-input";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { ScanApp } from "../auth/scan-app";
import { codeOf, StepUpDialog } from "../hospitals/step-up-dialog";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

export const MOVE_TITLE = "Move to a new authenticator app";
export const TOO_LONG = "That took too long. Start again.";

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
  const net = useNeedsConnection("move-offline");
  const start = useStartMfaReplace();
  const call = useStepUpCall(start);
  const confirm = useConfirmMfaReplace();
  const [phase, setPhase] = useState<Phase>("check");
  const [setup, setSetup] = useState<MfaReplace | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
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
    call.clear();
    confirm.reset();
    onClose();
  };
  const again = () => {
    setSetup(null);
    setCode("");
    setError(null);
    call.clear();
    setPhase("check");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = normalizeCode(code);
    if (digits.length !== 6 || busy || sending.current || net.offline) return;
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
        setError(err);
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
        open
        title={MOVE_TITLE}
        intro={
          <p>
            Use this when you get a new phone or want to use a different
            authenticator app. Your current app keeps working until you finish.
          </p>
        }
        confirmLabel="Continue"
        tone="primary"
        busy={call.busy}
        error={call.error}
        onClose={close}
        onConfirm={(input) =>
          call.run(codeOf(input), {
            onSuccess: (r) => {
              setSetup(r);
              setPhase("scan");
            },
            onError: (e) => {
              if (!sessionEnded(e)) return false;
              void signOut("expired");
              return true;
            },
          })
        }
      />
    );

  const words = error ? platformError(error) : null;
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
            {words && (
              <div className="mb-4">
                <Banner
                  tone={words.unavailable ? "info" : "bad"}
                  title={words.title}
                >
                  {words.body}
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
            <OfflineNote id="move-offline" />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                {...net.props}
                disabled={
                  normalizeCode(code).length !== 6 || busy || net.offline
                }
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
