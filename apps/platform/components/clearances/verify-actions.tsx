"use client";
import { Ban, BadgeCheck, CircleX } from "lucide-react";
import { useId, useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import { REJECT_LABEL, REVOKE_LABEL } from "@mhai/ui/clearances";
import type {
  Clearance,
  NamedPosition,
  RejectReason,
  RevokeReason,
} from "@/lib/api/clearances-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { BLOCK_TEXT, statusText, verifiedToast } from "@/lib/clearances/labels";
import { verifyBlock } from "@/lib/clearances/queue";
import { platformError } from "@/lib/errors";
import {
  useNamedAccessState,
  useRefreshClearance,
  useReject,
  useRevoke,
  useVerify,
} from "@/lib/queries/clearances";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

/** The words for a refusal on a letter, by code (spec §6.3, S21). */
export const LETTER_ERRORS: Partial<Record<string, string>> = {
  same_side: BLOCK_TEXT.same_side,
  same_person: BLOCK_TEXT.covers_you,
  not_ready: BLOCK_TEXT.not_ready,
};

/**
 * Refusals that mean the letter isn't as the person saw it, or isn't
 * theirs to decide: the dialog closes, the panel says why and the letter
 * is loaded again.
 */
const REFUSED = [
  "same_side",
  "same_person",
  "not_ready",
  "conflict",
  "not_found",
];

const options = <K extends string>(words: Record<K, string>) =>
  (Object.keys(words) as K[]).map((code) => ({ code, label: words[code] }));

type Asking = "verify" | "reject" | "revoke" | null;

/**
 * Verify, Reject and Revoke for one letter. Who may verify or reject is
 * `verifyBlock` over the server's `covers_you` and `verifiable_by_you`:
 * a covered admin and a linked admin see why (and no buttons), an auditor
 * sees nothing. Revoke is for platform admins, on a waiting or active
 * letter (by its hospital's `today`). Each sends the version the person
 * saw, with their two-step code; offline, all are off. After an answer the
 * caller keeps the focus in the letter (`onSettled`).
 */
export function VerifyActions({
  letter: c,
  onSettled,
}: {
  letter: Clearance;
  /**
   * "done": the action went through, and its button may be gone; "refused":
   * the letter is being loaded again, which may take the buttons away.
   */
  onSettled(how: "done" | "refused"): void;
}) {
  const { user } = useAuth();
  const isAdmin = isPlatformAdmin(user);
  const toast = useToast();
  const offlineId = useId();
  const net = useNeedsConnection(offlineId);
  const named = useNamedAccessState();
  const verify = useStepUpCall(useVerify());
  const reject = useStepUpCall(useReject());
  const revoke = useStepUpCall(useRevoke());
  const refresh = useRefreshClearance();
  const [asking, setAsking] = useState<Asking>(null);
  // The version the person saw when they began: they act on that, only.
  const [seen, setSeen] = useState(c.version);
  const [refusal, setRefusal] = useState<{
    title: string;
    body: string;
  } | null>(null);

  const block = verifyBlock(c, isAdmin);
  const live =
    c.status === "waiting" ||
    (c.status === "active" && statusText(c, c.today).icon !== "calendar-x");
  // A covered or linked admin sees their line only, with no buttons.
  const canRevoke = live && (block === null || block === "done");
  if (!isAdmin) return null;

  const effective: NamedPosition =
    named.data?.hospitals.find((h) => h.hospital.id === c.hospital.id)
      ?.effective ?? "off";

  const begin = (a: Exclude<Asking, null>) => {
    setRefusal(null);
    setSeen(c.version);
    setAsking(a);
  };
  const close = () => {
    setAsking(null);
    verify.clear();
    reject.clear();
    revoke.clear();
  };
  /** Not as the person saw it, or not theirs: close, say why, reload. */
  const refused = (e: unknown) => {
    if (!(e instanceof ApiError && REFUSED.includes(e.code))) return false;
    close();
    const w = platformError(e, LETTER_ERRORS);
    setRefusal({
      title: w.title,
      body: w.stale ? "The letter has been loaded again." : "",
    });
    onSettled("refused");
    void refresh(c.id);
    return true;
  };
  const done = (title: string) => {
    close();
    onSettled("done");
    toast.show({ title, tone: "ok", live: "polite" });
  };

  const confirmVerify = (input: StepUpInput) =>
    verify.run(
      { id: c.id, version: seen, ...codeOf(input) },
      {
        onSuccess: (r) => done(verifiedToast(r, effective)),
        onError: refused,
      },
    );
  const confirmReject = (input: StepUpInput) =>
    reject.run(
      {
        id: c.id,
        reason: input.reason as RejectReason,
        ...(input.note ? { note: input.note } : {}),
        version: seen,
        ...codeOf(input),
      },
      { onSuccess: () => done("Letter rejected"), onError: refused },
    );
  const confirmRevoke = (input: StepUpInput) =>
    revoke.run(
      {
        id: c.id,
        reason: input.reason as RevokeReason,
        ...(input.note ? { note: input.note } : {}),
        version: seen,
        ...codeOf(input),
      },
      { onSuccess: () => done("Letter revoked"), onError: refused },
    );

  const line = "text-[13.5px] font-semibold text-ink-2";
  const blocked =
    block === "covers_you" || block === "same_side" || block === "not_ready";

  return (
    <div className="flex flex-col gap-3">
      {/* Not said twice: the reloaded letter's own line may already say it. */}
      {refusal && !(blocked && refusal.title === BLOCK_TEXT[block]) && (
        <Banner tone="bad" title={refusal.title}>
          {refusal.body}
        </Banner>
      )}
      {blocked && <p className={line}>{BLOCK_TEXT[block]}</p>}
      {(block === null || canRevoke) && (
        <div className="flex flex-wrap gap-2">
          {block === null && (
            <>
              <Button {...net.props} onClick={() => begin("verify")}>
                <BadgeCheck aria-hidden className="size-4" />
                Verify
              </Button>
              <Button
                variant="ghost"
                {...net.props}
                onClick={() => begin("reject")}
              >
                <CircleX aria-hidden className="size-4" />
                Reject
              </Button>
            </>
          )}
          {canRevoke && (
            <Button
              variant="danger"
              {...net.props}
              onClick={() => begin("revoke")}
            >
              <Ban aria-hidden className="size-4" />
              Revoke
            </Button>
          )}
        </div>
      )}
      {(block === null || canRevoke) && <OfflineNote id={offlineId} />}

      <StepUpDialog
        open={asking === "verify"}
        title="Verify this letter?"
        intro={
          <p>Names unlock for these people at once if named access is On</p>
        }
        confirmLabel="Verify"
        tone="primary"
        busy={verify.busy}
        error={verify.error}
        onClose={close}
        onConfirm={confirmVerify}
      />
      <StepUpDialog
        open={asking === "reject"}
        title="Reject this letter?"
        intro={<p>The reason is shown to the hospital</p>}
        reasons={options(REJECT_LABEL)}
        noteFor="other"
        confirmLabel="Reject"
        tone="danger"
        busy={reject.busy}
        error={reject.error}
        onClose={close}
        onConfirm={confirmReject}
      />
      <StepUpDialog
        open={asking === "revoke"}
        title="Revoke this letter?"
        intro={
          <p>
            Everyone it covers loses named access at once. The reason is shown
            to the hospital.
          </p>
        }
        reasons={options(REVOKE_LABEL)}
        noteFor="other"
        confirmLabel="Revoke"
        tone="danger"
        busy={revoke.busy}
        error={revoke.error}
        onClose={close}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
