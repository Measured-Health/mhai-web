"use client";
import { useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { SettingsOut } from "@/lib/api/settings-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { healthKey } from "@/lib/queries/ops";
import {
  useRefreshSettings,
  useSetCleanUpPaused,
} from "@/lib/queries/settings";
import { pausedLine } from "@/lib/settings/rules";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";
import { useNeedsConnection } from "../states/offline-strip";

/** The section's own offline note, shown once by RetentionSection. */
const OFFLINE_ID = "retention-offline";

/** Refusals that mean it isn't as the person saw it: say so, reload. */
const REFUSED = ["conflict"];

/**
 * Pause or resume the daily records clean-up. Platform admins ask with a
 * reason and their code; it applies at once. Everyone who can open Settings
 * sees who paused it and since when.
 */
export function PauseCleanUp({ settings }: { settings: SettingsOut }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const toast = useToast();
  const qc = useQueryClient();
  const net = useNeedsConnection(OFFLINE_ID);
  const refresh = useRefreshSettings();
  const save = useStepUpCall(useSetCleanUpPaused());
  const [asking, setAsking] = useState<{ pause: boolean }>();
  const [refusal, setRefusal] = useState<string | null>(null);
  const r = settings.retention;
  const pause = asking?.pause ?? !r.paused;

  const close = () => {
    setAsking(undefined);
    save.clear();
  };
  const confirm = (input: StepUpInput) => {
    if (!asking) return;
    const want = asking.pause;
    save.run(
      { paused: want, reason: input.reason ?? "", ...codeOf(input) },
      {
        onSuccess: () => {
          close();
          void qc.invalidateQueries({ queryKey: healthKey });
          toast.show({
            title: want ? "Clean-up paused" : "Clean-up resumed",
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

  return (
    <div className="mb-3">
      {refusal && (
        <div className="mb-3">
          <Banner tone="bad" title={refusal} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {r.paused ? (
          <p className="text-[13.5px] font-semibold">
            {pausedLine(r.paused_by, r.paused_at)}
          </p>
        ) : (
          <p className="text-[13.5px] text-ink-2">
            The records clean-up runs every day.
          </p>
        )}
        {canAct && (
          <Button
            size="sm"
            variant="ghost"
            {...net.props}
            onClick={() => {
              setRefusal(null);
              setAsking({ pause: !r.paused });
            }}
          >
            {r.paused ? "Resume clean-up" : "Pause clean-up"}
          </Button>
        )}
      </div>
      {canAct && (
        <StepUpDialog
          open={!!asking}
          title={
            pause
              ? "Pause the records clean-up?"
              : "Resume the records clean-up?"
          }
          intro={
            pause ? (
              <p>
                No records are deleted while it is paused. It applies at once.
              </p>
            ) : (
              <p>
                The next daily clean-up deletes what is due. It applies at once.
              </p>
            )
          }
          freeReason
          confirmLabel={pause ? "Pause clean-up" : "Resume clean-up"}
          tone={pause ? "danger" : "primary"}
          busy={save.busy}
          error={save.error}
          onClose={close}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
