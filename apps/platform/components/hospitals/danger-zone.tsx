"use client";
import { useState } from "react";
import type { Hospital } from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { useRefreshHospital, useRequestRemoval } from "@/lib/queries/removal";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { Section } from "./section";
import { StepUpDialog, type StepUpInput } from "./step-up-dialog";

export const REMOVAL_WARNING =
  "Removal is permanent. After it's done only the audit trail remains.";
const NOT_YET = "Deactivate the hospital first.";

/**
 * Request removal (spec §7.6): only while the hospital is deactivated, with
 * a reason and the person's own two-step code. Gone once a removal is under
 * way: the removal panel takes over.
 */
export function DangerZone({ hospital: h }: { hospital: Hospital }) {
  const { user, updateUser } = useAuth();
  const canAct = isPlatformAdmin(user);
  const [asking, setAsking] = useState(false);
  const request = useRequestRemoval(h.id);
  const refresh = useRefreshHospital(h.id);
  const toast = useToast();
  const net = useNeedsConnection("danger-offline");
  if (h.removal || h.status === "removed") return null;
  const ready = h.status === "deactivated";

  const close = () => {
    setAsking(false);
    // Forget the call, and with it the code in its variables.
    request.reset();
  };
  const confirm = ({ reason = "", ...rest }: StepUpInput) => {
    const code =
      "backup_code" in rest
        ? { backup_code: rest.backup_code }
        : { mfa_code: rest.mfa_code };
    request.mutate(
      { reason, ...code },
      {
        onSuccess: () => {
          toast.show({
            title: "Removal requested",
            body: `${h.name}: a different platform admin must approve it.`,
            tone: "ok",
            live: "polite",
          });
          // A backup code works once; Account shows what's left.
          if ("backup_code" in code && user?.backupCodesLeft != null)
            updateUser({
              backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
            });
          close();
        },
        onError: (e) => {
          const w = platformError(e);
          // It changed or went while the dialog was open: show the latest.
          if (w.gone || w.stale) {
            close();
            toast.show({ title: w.title, body: w.body, live: "assertive" });
            refresh();
          }
        },
      },
    );
  };

  // Offline wins over "not yet": it's the reason that applies right now.
  const off = net.offline
    ? net.props
    : ready
      ? {}
      : { disabled: true, "aria-describedby": "danger-not-yet" };

  return (
    <Section title="Danger zone">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[13.5px] text-ink-2">{REMOVAL_WARNING}</p>
        {canAct && (
          <div className="ml-auto">
            <Button
              size="sm"
              variant="danger"
              {...off}
              onClick={() => setAsking(true)}
            >
              Request removal
            </Button>
          </div>
        )}
      </div>
      {canAct && !ready && (
        <p id="danger-not-yet" className="mt-2 text-[13px] text-ink-3">
          {NOT_YET}
        </p>
      )}
      {canAct && <OfflineNote id="danger-offline" />}
      {canAct && (
        <StepUpDialog
          open={asking}
          title={`Request removal of ${h.name}?`}
          intro={<p>{REMOVAL_WARNING}</p>}
          freeReason
          confirmLabel="Request removal"
          tone="danger"
          busy={request.isPending}
          error={request.error}
          onClose={close}
          onConfirm={confirm}
        />
      )}
    </Section>
  );
}
