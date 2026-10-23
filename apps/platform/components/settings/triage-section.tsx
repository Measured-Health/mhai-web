"use client";
import { CircleCheck, CircleSlash } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { SettingsOut } from "@/lib/api/settings-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { useRefreshSettings, useSetTriage } from "@/lib/queries/settings";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { notReadyIsKnown, notReadyLabel } from "@/lib/settings/labels";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { Section } from "../hospitals/section";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { WAITING } from "../shared/two-person";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { ChangedLine } from "./changed-line";
import { SectionFailed } from "./section-failed";

export const TRIAGE_TITLE = "Triage";
export const TRIAGE_WHAT = "triage";
export const SIGNOFF_LABEL =
  "Clinical sign-off (who approved it and their reference)";
export const SIGNOFF_MAX = 200;

/** Refusals that mean triage isn't as the person saw it: say so, reload. */
const REFUSED = ["conflict", "not_ready", "not_found"];

type Asking = "off" | "on";

/**
 * Whether triage is on, and whether it could be switched on. Off is at once;
 * on needs the validation to be ready, a clinical sign-off and a different
 * platform admin's approval. Auditors read the state and change nothing.
 */
export function TriageSection({ settings }: { settings: SettingsOut }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const toast = useToast();
  const net = useNeedsConnection("triage-offline");
  const refresh = useRefreshSettings();
  const save = useStepUpCall(useSetTriage());
  const [asking, setAsking] = useState<{ what: Asking; version: number }>();
  const [refusal, setRefusal] = useState<string | null>(null);
  const t = settings.triage;

  // A reading this app has no words for fails the section, never raw.
  if (
    typeof t.enabled !== "boolean" ||
    typeof t.ready !== "boolean" ||
    !notReadyIsKnown(t.not_ready_reason) ||
    (!t.ready && t.not_ready_reason === null)
  )
    return (
      <SectionFailed
        title={TRIAGE_TITLE}
        what={TRIAGE_WHAT}
        onRetry={() => void refresh()}
      />
    );

  const requested = settings.pending.some((r) => r.kind === "triage_on");
  const close = () => {
    setAsking(undefined);
    save.clear();
  };
  const open = (what: Asking) => {
    setRefusal(null);
    setAsking({ what, version: t.version });
  };

  const confirm = (input: StepUpInput) => {
    if (!asking) return;
    const on = asking.what === "on";
    save.run(
      {
        enabled: on,
        reason: input.reason ?? "",
        ...(on ? { clinical_signoff: input.extra ?? "" } : {}),
        version: asking.version,
        ...codeOf(input),
      },
      {
        onSuccess: () => {
          close();
          toast.show({
            title: on ? WAITING : "Triage is off",
            tone: "ok",
            live: "polite",
          });
        },
        onError: (e) => {
          if (!(e instanceof ApiError && REFUSED.includes(e.code)))
            return false;
          close();
          setRefusal(platformError(e).title);
          void refresh();
          return true;
        },
      },
    );
  };

  const StateIcon = t.enabled ? CircleCheck : CircleSlash;
  const canAsk = !t.enabled && t.ready && !requested;

  return (
    <Section title={TRIAGE_TITLE}>
      {refusal && (
        <div className="mb-3">
          <Banner tone="bad" title={refusal} />
        </div>
      )}
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <StateIcon aria-hidden className="size-4" />
        {t.enabled ? "Triage: On" : "Triage: Off"}
      </p>
      {!t.enabled && (
        <p className="mt-1 text-[13.5px] text-ink-2 [overflow-wrap:anywhere]">
          {t.ready ? "Ready to switch on" : notReadyLabel(t.not_ready_reason!)}
        </p>
      )}
      {requested && !t.enabled && (
        <p className="mt-1 text-[13.5px] text-ink-2">{WAITING}</p>
      )}
      <ChangedLine by={t.changed_by} at={t.changed_at} />
      {canAct && (t.enabled || canAsk) && (
        <div className="mt-3">
          <Button
            variant={t.enabled ? "danger" : "primary"}
            size="sm"
            {...net.props}
            onClick={() => open(t.enabled ? "off" : "on")}
          >
            {t.enabled ? "Switch off" : "Ask to switch on"}
          </Button>
          <OfflineNote id="triage-offline" />
        </div>
      )}
      {canAct && (
        <StepUpDialog
          open={!!asking}
          title={
            asking?.what === "on"
              ? "Ask to switch triage on?"
              : "Switch triage off?"
          }
          intro={
            asking?.what === "on" ? (
              <p>
                Triage switches on once a different platform admin approves. The
                request lapses after 7 days.
              </p>
            ) : (
              <p>Triage switches off at once.</p>
            )
          }
          freeReason
          extra={
            asking?.what === "on"
              ? { label: SIGNOFF_LABEL, max: SIGNOFF_MAX }
              : undefined
          }
          confirmLabel={
            asking?.what === "on" ? "Ask to switch on" : "Switch off"
          }
          tone={asking?.what === "on" ? "primary" : "danger"}
          busy={save.busy}
          error={save.error}
          onClose={close}
          onConfirm={confirm}
        />
      )}
    </Section>
  );
}
