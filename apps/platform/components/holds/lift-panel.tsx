"use client";
import { useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import {
  DOCUMENT_REFERENCE,
  LIFT_REASONS,
  type LegalHold,
  type LiftReason,
} from "@/lib/api/holds-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { HOLD_HINT, liftReasonLabel } from "@/lib/holds/labels";
import { REFERENCE_HINT, REFERENCE_MAX, liftedLine } from "@/lib/holds/rules";
import {
  useApproveLift,
  useCancelLift,
  useRefreshHold,
  useRequestLift,
} from "@/lib/queries/holds";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { Section } from "../hospitals/section";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { TwoPersonActions } from "../shared/two-person";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

const STAYS_ACTIVE =
  "The hold stays active until a different platform admin approves.";
/** A lift's authority is the document that allows it, as a reference. */
const AUTHORITY = {
  label: "Authority for lifting (document reference)",
  max: REFERENCE_MAX,
  hint: REFERENCE_HINT,
  pattern: DOCUMENT_REFERENCE,
  patternError: "Use a document reference, like CT-2026-0091.",
};
/** Refusals that mean the hold is not as the person saw it: say so, reload. */
const REFUSED = ["expired", "same_person", "conflict", "not_found"];

/** What approving does: the hold is lifted at once, and can't be undone. */
export const LIFT_EFFECT =
  "Approving lifts the hold at once. Records it alone was keeping become due for the daily clean-up straight away, and the lift can't be undone.";

type Asking = "request" | "approve" | null;

/**
 * Lifting a hold takes two platform admins: one asks (reason, the
 * authority's document reference and their code), a different one approves
 * with their own code. Who may approve is the server's `requested_by_you`.
 * The hold is lifted at once on approval: no grace period, no undo.
 * Auditors see the words and no buttons.
 */
export function LiftPanel({ hold: h }: { hold: LegalHold }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const toast = useToast();
  const net = useNeedsConnection("lift-offline");
  const [asking, setAsking] = useState<Asking>(null);
  // The version the person saw when they began: they act on that, only.
  const [seen, setSeen] = useState(h.version);
  const [refusal, setRefusal] = useState<string | null>(null);
  const request = useStepUpCall(useRequestLift(h.id));
  const approve = useStepUpCall(useApproveLift(h.id));
  const cancel = useCancelLift(h.id);
  const refresh = useRefreshHold(h.id);

  const begin = (a: Exclude<Asking, null>) => {
    setRefusal(null);
    setSeen(h.version);
    setAsking(a);
  };
  const close = () => {
    setAsking(null);
    request.clear();
    approve.clear();
  };
  /** It isn't as the person saw it: close, say why, show the latest. */
  const refused = (e: unknown) => {
    if (!(e instanceof ApiError && REFUSED.includes(e.code))) return false;
    close();
    setRefusal(platformError(e).title);
    void refresh();
    return true;
  };
  const done = (title: string, body?: string) => {
    close();
    toast.show({ title, body, tone: "ok", live: "polite" });
  };

  const confirmRequest = (input: StepUpInput) =>
    request.run(
      {
        reason: input.reason as LiftReason,
        authority: input.extra ?? "",
        ...codeOf(input),
      },
      { onSuccess: () => done("Lift requested"), onError: refused },
    );
  const confirmApprove = (input: StepUpInput) =>
    approve.run(
      { version: seen, ...codeOf(input) },
      { onSuccess: () => done("Hold lifted"), onError: refused },
    );
  const doCancel = () => {
    setRefusal(null);
    cancel.mutate(
      { version: h.version },
      {
        onSuccess: () => done("Lift request cancelled"),
        onError: (e) => {
          if (!refused(e))
            toast.show({ title: platformError(e).title, live: "assertive" });
        },
      },
    );
  };

  const open = h.status === "active" || h.status === "review_due";
  const lift = h.status === "lift_requested" ? h.lift : null;
  const line = "text-[13.5px] text-ink-2 [overflow-wrap:anywhere]";

  return (
    <Section title="Lift">
      {refusal && (
        <div className="mb-3">
          <Banner tone="bad" title={refusal} />
        </div>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <p className={line}>
            Records it covers are kept until two platform admins agree to lift
            it.
          </p>
          {canAct && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              {...net.props}
              onClick={() => begin("request")}
            >
              Request lift
            </Button>
          )}
        </div>
      )}

      {lift && (
        <div className="flex flex-col gap-3">
          <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-[160px_1fr]">
            <dt className="text-ink-3">Reason for lifting</dt>
            <dd>{liftReasonLabel(lift.reason)}</dd>
            <dt className="text-ink-3">Authority</dt>
            <dd className="font-mono [overflow-wrap:anywhere]">
              {lift.authority}
            </dd>
          </dl>
          <p className="text-[13.5px] font-semibold">{STAYS_ACTIVE}</p>
          <p className={line}>{LIFT_EFFECT}</p>
          <TwoPersonActions
            request={lift}
            canAct={canAct}
            approveLabel="Approve lift"
            onApprove={() => begin("approve")}
            onCancel={doCancel}
            busy={cancel.isPending}
            offlineProps={net.props}
          />
        </div>
      )}

      {h.status === "lifted" && (
        <p className="text-[13.5px] font-semibold">{liftedLine(h)}</p>
      )}

      {canAct && (open || lift) && <OfflineNote id="lift-offline" />}

      {canAct && (
        <>
          <StepUpDialog
            open={asking === "request"}
            title={`Lift legal hold ${h.reference}?`}
            intro={<p>{STAYS_ACTIVE}</p>}
            reasons={LIFT_REASONS.map((r) => ({
              code: r,
              label: liftReasonLabel(r),
            }))}
            reasonLabel="Reason for lifting"
            noNote
            extra={AUTHORITY}
            hint={HOLD_HINT}
            confirmLabel="Request lift"
            tone="primary"
            busy={request.busy}
            error={request.error}
            onClose={close}
            onConfirm={confirmRequest}
          />
          <StepUpDialog
            open={asking === "approve" && !!lift}
            title={`Approve lifting ${h.reference}?`}
            intro={<p>{LIFT_EFFECT}</p>}
            confirmLabel="Approve lift"
            tone="danger"
            busy={approve.busy}
            error={approve.error}
            onClose={close}
            onConfirm={confirmApprove}
          />
        </>
      )}
    </Section>
  );
}
