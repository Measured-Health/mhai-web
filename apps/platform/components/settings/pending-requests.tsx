"use client";
import { useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { SettingsOut, SettingsRequest } from "@/lib/api/settings-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import {
  useApproveSettingsRequest,
  useCancelSettingsRequest,
  useFetchPreview,
  useRefreshSettings,
} from "@/lib/queries/settings";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { requestIsKnown, requestLabel } from "@/lib/settings/labels";
import { daysLabel, previewLine } from "@/lib/settings/rules";
import { Banner } from "@mhai/ui/banner";
import { useToast } from "@mhai/ui/toast";
import { Section } from "../hospitals/section";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { TwoPersonActions } from "../shared/two-person";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { SectionFailed } from "./section-failed";

export const PENDING_TITLE = "Changes waiting for approval";
export const PENDING_WHAT = "the changes waiting for approval";

/**
 * Refusals that mean the request isn't as the person saw it (it lapsed, it
 * is their own, triage is no longer ready, or it changed): say so, reload.
 */
const REFUSED = [
  "expired",
  "same_person",
  "not_ready",
  "conflict",
  "not_found",
];

/** The request being approved, the version seen, and its fresh preview. */
type Asking = { r: SettingsRequest; version: number; wouldDelete: number };

/**
 * The changes waiting for a second platform admin: a shorter retention
 * period or triage switched on. Approving a shorter period first reads
 * afresh what the next clean-up would delete. Who may approve is the
 * server's `requested_by_you`; either admin may cancel, with no code.
 */
export function PendingRequests({ settings }: { settings: SettingsOut }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const toast = useToast();
  const net = useNeedsConnection("pending-offline");
  const refresh = useRefreshSettings();
  const fetchPreview = useFetchPreview();
  const approve = useStepUpCall(useApproveSettingsRequest());
  const cancel = useCancelSettingsRequest();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const list = settings.pending;

  // A request this app has no words for fails the section, never raw.
  if (!list.every(requestIsKnown))
    return (
      <SectionFailed
        title={PENDING_TITLE}
        what={PENDING_WHAT}
        onRetry={() => void refresh()}
      />
    );

  const close = () => {
    setAsking(null);
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

  const begin = async (r: SettingsRequest) => {
    setRefusal(null);
    if (r.kind !== "retention_shorten") {
      setAsking({ r, version: r.version, wouldDelete: 0 });
      return;
    }
    // Never the count from when the request was made: read it now.
    setChecking(r.id);
    try {
      const p = await fetchPreview(r.type, r.to);
      setAsking({ r, version: r.version, wouldDelete: p.would_delete });
    } catch (e) {
      if (!refused(e))
        setRefusal("Couldn't check what would be deleted. Try again.");
    } finally {
      setChecking(null);
    }
  };

  const confirmApprove = (input: StepUpInput) => {
    if (!asking) return;
    approve.run(
      { id: asking.r.id, version: asking.version, ...codeOf(input) },
      {
        onSuccess: () => {
          close();
          toast.show({ title: "Change approved", tone: "ok", live: "polite" });
        },
        onError: refused,
      },
    );
  };
  const doCancel = (r: SettingsRequest) => {
    setRefusal(null);
    cancel.mutate(
      { id: r.id, version: r.version },
      {
        onSuccess: () =>
          toast.show({
            title: "Request cancelled",
            tone: "ok",
            live: "polite",
          }),
        onError: (e) => {
          if (!refused(e))
            toast.show({ title: platformError(e).title, live: "assertive" });
        },
      },
    );
  };

  const a = asking?.r;
  const line = "text-[13.5px] text-ink-2 [overflow-wrap:anywhere]";

  return (
    <Section title={PENDING_TITLE}>
      {refusal && (
        <div className="mb-3">
          <Banner tone="bad" title={refusal} />
        </div>
      )}
      {list.length === 0 ? (
        <p className={line}>No changes waiting for approval.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-line px-4 py-3">
              <p className="text-[14px] font-semibold">{requestLabel(r)}</p>
              {r.kind === "retention_shorten" ? (
                <p className={line}>Now {daysLabel(r.from)}</p>
              ) : (
                <p className={line}>Clinical sign-off: {r.clinical_signoff}</p>
              )}
              <p className={`${line} mb-2`}>Reason: {r.reason}</p>
              <TwoPersonActions
                request={r}
                canAct={canAct}
                approveLabel="Approve"
                onApprove={() => void begin(r)}
                onCancel={() => doCancel(r)}
                busy={
                  (cancel.isPending && cancel.variables?.v.id === r.id) ||
                  checking === r.id
                }
                offlineProps={net.props}
              />
            </li>
          ))}
        </ul>
      )}
      {canAct && list.length > 0 && <OfflineNote id="pending-offline" />}
      {canAct && (
        <StepUpDialog
          open={!!a}
          title={a ? `Approve ${requestLabel(a)}?` : "Approve"}
          intro={
            a?.kind === "retention_shorten" ? (
              <>
                <p>{previewLine(a.to, asking!.wouldDelete)}</p>
                <p className="mt-1">
                  Requested by {a.requested_by.name}. It applies once you
                  approve.
                </p>
              </>
            ) : a?.kind === "triage_on" ? (
              <>
                <p>Triage switches on once you approve.</p>
                <p className="mt-1">Clinical sign-off: {a.clinical_signoff}</p>
              </>
            ) : undefined
          }
          confirmLabel="Approve change"
          tone={a?.kind === "retention_shorten" ? "danger" : "primary"}
          busy={approve.busy}
          error={approve.error}
          onClose={close}
          onConfirm={confirmApprove}
        />
      )}
    </Section>
  );
}
