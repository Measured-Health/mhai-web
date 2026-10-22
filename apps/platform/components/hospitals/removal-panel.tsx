"use client";
import { CheckCircle2, OctagonAlert } from "lucide-react";
import { useRef, useState } from "react";
import {
  BlockedError,
  type Hospital,
  type RemovalBlock,
  type RemovalRequest,
} from "@/lib/api/contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import {
  useApproveRemoval,
  useCancelRemoval,
  useRefreshHospital,
  useWatchRemoval,
} from "@/lib/queries/removal";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";
import { WAITING } from "../shared/two-person";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { REMOVAL_WARNING } from "./danger-zone";
import { dateLabel } from "./format";
import { Section } from "./section";
import { StepUpDialog, type StepUpInput } from "./step-up-dialog";

const BLOCKED_NOTE =
  "Removal can't go ahead until the checks above are cleared.";
const HOLDS_LATER = "Legal holds are managed in a later release.";
const REMOVED = "Removed. Only the audit trail remains.";

export type CheckLine = { text: string; blocks: boolean };

/**
 * The backend's removal checks in plain words. `blocking` is the server's
 * say on what blocks; the counts and the date come from `checks`.
 */
export function checkLines(
  c: RemovalRequest["checks"],
  blocking: readonly RemovalBlock[],
): CheckLine[] {
  const lines: CheckLine[] = [];
  const n = c.legal_holds;
  if (n > 0)
    lines.push({
      text: n === 1 ? "1 legal hold is active" : `${n} legal holds are active`,
      blocks: true,
    });
  else if (blocking.includes("legal_hold"))
    lines.push({ text: "A legal hold is active", blocks: true });
  if (blocking.includes("retention"))
    lines.push({
      text: c.retention_until
        ? `Records must be kept until ${dateLabel(c.retention_until)}`
        : "Records are still inside their retention period",
      blocks: true,
    });
  const exportBlocks = blocking.includes("export_required");
  if (c.export_required || exportBlocks)
    lines.push({
      text: `A data export is required · ${c.export_done && !exportBlocks ? "done" : "not done yet"}`,
      blocks: exportBlocks || !c.export_done,
    });
  if (blocking.length === 0 && !lines.some((l) => l.blocks))
    return [{ text: "All checks are clear", blocks: false }, ...lines];
  return lines;
}

function Checks({ lines, id }: { lines: CheckLine[]; id?: string }) {
  return (
    <ul id={id} className="flex flex-col gap-1.5 text-[13.5px]">
      {lines.map((l) => (
        <li key={l.text} className="flex items-center gap-2">
          {l.blocks ? (
            <OctagonAlert aria-hidden className="size-4 shrink-0 text-bad" />
          ) : (
            <CheckCircle2 aria-hidden className="size-4 shrink-0 text-ok" />
          )}
          {l.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * A removal under way (spec §7.6): who asked and why, the backend's checks
 * in plain words, and Approve (a different platform admin, with their own
 * code) or Cancel request. Once removed, only the words remain.
 */
export function RemovalPanel({ hospital: h }: { hospital: Hospital }) {
  const { user, updateUser } = useAuth();
  const canAct = isPlatformAdmin(user);
  const [asking, setAsking] = useState(false);
  // The server refused an approval as blocked; the refreshed checks say why.
  const [refused, setRefused] = useState(false);
  // Cancelling an approved removal asks first.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const approve = useApproveRemoval(h.id);
  const cancel = useCancelRemoval(h.id);
  const refresh = useRefreshHospital(h.id);
  const toast = useToast();
  const net = useNeedsConnection("removal-offline");
  useWatchRemoval(h);
  const r = h.removal;
  if (!r) return null;

  const done = h.status === "removed" || r.status === "done";
  const scheduled = !done && r.status === "scheduled";
  const requested = !done && r.status === "requested";
  const blocked = r.blocking.length > 0;
  // The server says who asked: names can repeat, ids differ by source.
  const mine = r.requested_by_you;
  const actions = canAct && !done;

  const close = () => {
    setAsking(false);
    // Forget the call, and with it the code in its variables.
    approve.reset();
  };
  /** It changed or went meanwhile: say so and show the latest. */
  const changed = (e: unknown) => {
    const w = platformError(e);
    if (!w.gone && !w.stale) return false;
    toast.show({ title: w.title, body: w.body, live: "assertive" });
    void refresh();
    return true;
  };

  const confirmApprove = (input: StepUpInput) => {
    const code =
      "backup_code" in input
        ? { backup_code: input.backup_code }
        : { mfa_code: input.mfa_code };
    approve.mutate(code, {
      onSuccess: () => {
        toast.show({
          title: "Removal scheduled",
          body: `${h.name} will be removed shortly.`,
          tone: "ok",
          live: "polite",
        });
        if ("backup_code" in code && user?.backupCodesLeft != null)
          updateUser({
            backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
          });
        close();
      },
      onError: (e) => {
        if (e instanceof BlockedError) {
          close();
          setRefused(true);
          void refresh();
        } else if (changed(e)) close();
      },
    });
  };
  const doCancel = () => {
    setConfirmCancel(false);
    cancel.mutate(undefined, {
      onSuccess: () =>
        toast.show({
          title: "Removal request cancelled",
          body: `${h.name} stays deactivated.`,
          tone: "ok",
          live: "polite",
        }),
      onError: (e) => {
        if (!changed(e))
          toast.show({
            title: platformError(e).title,
            live: "assertive",
          });
      },
    });
  };

  const holds = r.blocking.includes("legal_hold");
  const approveOff = net.offline
    ? net.props
    : blocked
      ? {
          disabled: true,
          "aria-describedby": holds
            ? "removal-blocked removal-holds-later"
            : "removal-blocked",
        }
      : {};

  return (
    <Section title="Removal">
      <p className="text-[13.5px] text-ink-2 [overflow-wrap:anywhere]">
        Requested by {r.requested_by.name} · {dateLabel(r.requested_at)} ·{" "}
        {r.reason}
      </p>
      {r.approved_by && r.approved_at && (scheduled || done) && (
        <p className="mt-1 text-[13.5px] text-ink-2">
          {scheduled ? "Removal scheduled · approved by" : "Approved by"}{" "}
          {r.approved_by.name} · {dateLabel(r.approved_at)}
        </p>
      )}
      {done ? (
        <p className="mt-3 text-[14px] font-semibold">{REMOVED}</p>
      ) : (
        <div className="mt-3">
          <Checks lines={checkLines(r.checks, r.blocking)} />
          {requested && blocked && (
            <div className="mt-2 text-[13px] text-ink-3">
              <p id="removal-blocked">{BLOCKED_NOTE}</p>
              {holds && <p id="removal-holds-later">{HOLDS_LATER}</p>}
            </div>
          )}
        </div>
      )}
      {/* Shown once the refreshed checks say what blocks; gone when clear. */}
      {refused && requested && blocked && (
        <div className="mt-3">
          <Banner tone="bad" title="Removal can't go ahead yet." />
        </div>
      )}
      {actions && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {requested && mine && (
            <p className="text-[13.5px] text-ink-2">{WAITING}</p>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {requested && !mine && (
              <Button
                size="sm"
                variant="danger"
                {...approveOff}
                onClick={() => {
                  setRefused(false);
                  setAsking(true);
                }}
              >
                Approve removal
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={cancel.isPending}
              {...net.props}
              onClick={() => (scheduled ? setConfirmCancel(true) : doCancel())}
            >
              Cancel request
            </Button>
          </div>
        </div>
      )}
      {actions && <OfflineNote id="removal-offline" />}
      {actions && (
        <StepUpDialog
          open={asking}
          title={`Approve removal of ${h.name}?`}
          intro={<p>{REMOVAL_WARNING}</p>}
          confirmLabel="Approve removal"
          tone="danger"
          busy={approve.isPending}
          error={approve.error}
          onClose={close}
          onConfirm={confirmApprove}
        />
      )}
      {actions && (
        <Dialog
          open={confirmCancel && scheduled}
          onClose={() => setConfirmCancel(false)}
          title={`Cancel the removal of ${h.name}?`}
          initialFocus={keep}
        >
          <p className="mb-[18px] text-[14.5px] text-ink-2">
            It will need a new request and approval.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              ref={keep}
              variant="ghost"
              onClick={() => setConfirmCancel(false)}
            >
              Keep
            </Button>
            <Button variant="danger" {...net.props} onClick={doCancel}>
              Cancel removal
            </Button>
          </div>
        </Dialog>
      )}
    </Section>
  );
}
