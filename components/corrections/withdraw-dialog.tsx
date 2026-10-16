"use client";
import { useState, type ReactNode } from "react";
import { useWithdrawCorrection } from "@/lib/correction-queries";
import { decisionError, type DecisionError } from "@/lib/corrections";
import { useNetwork } from "@/lib/network";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

/** "Keep it" comes first, so it gets the focus: the safe default (spec §7). */
export function WithdrawDialog({
  open,
  onClose,
  onConfirm,
  busy,
  error,
  offline = false,
}: {
  open: boolean;
  onClose(): void;
  onConfirm(): void;
  busy: boolean;
  error: DecisionError | null;
  /** The connection dropped while the dialog was open: nothing can be sent. */
  offline?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Withdraw this correction?">
      <p className="text-sm text-ink-2">
        It leaves the review queue and nothing changes. You can suggest a new
        correction later.
      </p>
      {offline && (
        <p className="mt-3 text-[13px] text-ink-3">
          You&apos;re offline. Withdrawing needs a connection.
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
        <Button variant="danger" disabled={busy || offline} onClick={onConfirm}>
          Withdraw
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * The whole withdraw flow in one place: ask first, withdraw, toast, and map
 * errors (already decided and so on). `before` runs after the confirm and
 * before the withdraw (a failure there keeps the dialog open); `onDone`
 * runs once it is withdrawn. Render `dialog` once; call `ask(id)` to open it.
 */
export function useWithdrawFlow(opts?: {
  before?: () => Promise<void> | void;
  onDone?: (id: string) => void;
}): { ask(id: string): void; dialog: ReactNode } {
  const withdraw = useWithdrawCorrection();
  const toast = useToast();
  const { online } = useNetwork();
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState<DecisionError | null>(null);
  const [working, setWorking] = useState(false);

  const close = () => setId(null);
  async function confirm() {
    if (!id || !navigator.onLine) return;
    setError(null);
    setWorking(true);
    try {
      await opts?.before?.();
    } catch (e) {
      setWorking(false);
      setError(decisionError(e, "withdraw"));
      return;
    }
    withdraw.mutate(
      { id },
      {
        onSuccess: () => {
          close();
          toast.show({
            title: "Correction withdrawn",
            body: "It has left the review queue.",
            tone: "info",
          });
          opts?.onDone?.(id);
        },
        onError: (e) => {
          const err = decisionError(e, "withdraw");
          if (!err.gone) return setError(err);
          close();
          toast.show({ title: err.title, body: err.body, ms: 8000 });
        },
        onSettled: () => setWorking(false),
      },
    );
  }

  return {
    ask(next) {
      setError(null);
      setId(next);
    },
    dialog: (
      <WithdrawDialog
        open={id !== null}
        onClose={close}
        onConfirm={() => void confirm()}
        busy={working || withdraw.isPending}
        error={error}
        offline={!online}
      />
    ),
  };
}
