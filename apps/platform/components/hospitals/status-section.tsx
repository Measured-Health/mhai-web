"use client";
import { useState } from "react";
import type { DeactivateReason, Hospital } from "@/lib/api/contract";
import { useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { REASONS, reasonLabel } from "@/lib/labels";
import { useDeactivate, useReactivate } from "@/lib/queries/hospitals";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { dateLabel } from "./format";
import { Section } from "./section";
import { StatusChip } from "./status-chip";
import { StepUpDialog, type StepUpInput } from "./step-up-dialog";

const DEACTIVATE_EFFECT =
  "All staff are signed out at once and can't sign in. Pending invites stop working. No data is deleted.";
const REACTIVATE_EFFECT =
  "Staff can sign in again. Old sessions are not revived.";
const REASON_CHOICES = REASONS.map((code) => ({
  code,
  label: reasonLabel(code),
}));

/** "Deactivated by Ada Bakare · 21 Oct 2026 · Contract ended". */
export function deactivatedLine(d: NonNullable<Hospital["deactivation"]>) {
  return `Deactivated by ${d.by.name} · ${dateLabel(d.at)} · ${reasonLabel(d.reason)}`;
}

/**
 * The status, who deactivated it and why, and Deactivate or Reactivate for
 * platform admins: both need the person's own two-step code.
 */
export function StatusSection({
  hospital: h,
  canAct,
  onGone,
}: {
  hospital: Hospital;
  canAct: boolean;
  /** Refetches the hospital, e.g. when it changed or went meanwhile. */
  onGone(): void;
}) {
  const [asking, setAsking] = useState<"deactivate" | "reactivate" | null>(
    null,
  );
  const deactivate = useDeactivate(h.id);
  const reactivate = useReactivate(h.id);
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const net = useNeedsConnection("status-offline");
  const canDeactivate =
    h.status === "active" || h.status === "setup_incomplete";
  const canReactivate = h.status === "deactivated";

  const close = () => {
    setAsking(null);
    // Forget the call, and with it the code in its variables.
    deactivate.reset();
    reactivate.reset();
  };
  const handlers = (title: string, body: string, backup: boolean) => ({
    onSuccess: () => {
      toast.show({ title, body, tone: "ok" as const, live: "polite" as const });
      // A backup code works once; Account shows what's left.
      if (backup && user?.backupCodesLeft != null)
        updateUser({ backupCodesLeft: Math.max(0, user.backupCodesLeft - 1) });
      close();
    },
    onError: (e: Error) => {
      const w = platformError(e);
      // It changed or went while the dialog was open: close it, say so and
      // show the latest (no second code for a change that may be done).
      if (w.gone || w.stale) {
        close();
        toast.show({ title: w.title, body: w.body, live: "assertive" });
        onGone();
      }
    },
  });
  const confirm = (input: StepUpInput) => {
    const { reason = "", note, ...rest } = input;
    const code =
      "backup_code" in rest
        ? { backup_code: rest.backup_code }
        : { mfa_code: rest.mfa_code };
    const backup = "backup_code" in code;
    if (asking === "deactivate")
      deactivate.mutate(
        {
          reason: reason as DeactivateReason,
          ...(note ? { note } : {}),
          ...code,
        },
        handlers(
          "Hospital deactivated",
          `${h.name}: all staff were signed out.`,
          backup,
        ),
      );
    else
      reactivate.mutate(
        { reason, ...code },
        handlers(
          "Hospital reactivated",
          `${h.name}: staff can sign in again.`,
          backup,
        ),
      );
  };

  return (
    <Section title="Status">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusChip status={h.status} />
        {h.deactivation && (
          <p className="text-[13.5px] text-ink-2">
            {deactivatedLine(h.deactivation)}
          </p>
        )}
        {canAct && (canDeactivate || canReactivate) && (
          <div className="ml-auto">
            {canDeactivate ? (
              <Button
                size="sm"
                variant="danger"
                {...net.props}
                onClick={() => setAsking("deactivate")}
              >
                Deactivate
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                {...net.props}
                onClick={() => setAsking("reactivate")}
              >
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>
      {h.deactivation?.note && (
        <p className="mt-2 text-[13px] text-ink-3 [overflow-wrap:anywhere]">
          Note: {h.deactivation.note}
        </p>
      )}
      {canAct && <OfflineNote id="status-offline" />}
      {canAct && (
        <StepUpDialog
          open={asking === "deactivate"}
          title={`Deactivate ${h.name}?`}
          intro={<p>{DEACTIVATE_EFFECT}</p>}
          reasons={REASON_CHOICES}
          noteFor="other"
          confirmLabel="Deactivate"
          tone="danger"
          busy={deactivate.isPending}
          error={deactivate.error}
          onClose={close}
          onConfirm={confirm}
        />
      )}
      {canAct && (
        <StepUpDialog
          open={asking === "reactivate"}
          title={`Reactivate ${h.name}?`}
          intro={<p>{REACTIVATE_EFFECT}</p>}
          freeReason
          confirmLabel="Reactivate"
          tone="primary"
          busy={reactivate.isPending}
          error={reactivate.error}
          onClose={close}
          onConfirm={confirm}
        />
      )}
    </Section>
  );
}
