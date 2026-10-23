"use client";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@mhai/api-client/errors";
import type { SettingsOut } from "@/lib/api/settings-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { dateLabel, timeLabel } from "@/lib/format";
import {
  useRefreshSettings,
  useResetFeedbackBuffer,
} from "@/lib/queries/settings";
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
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { SectionFailed } from "./section-failed";

export const LEARNING_TITLE = "Clear unapproved learning data";
export const LEARNING_WHAT = "the learning data";

/** Refusals that mean it isn't as the person saw it (e.g. already running). */
const REFUSED = ["conflict", "not_found"];

const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/**
 * Feedback that no one has approved yet, waiting to teach the system. A
 * platform admin can clear it all (approved corrections and guidelines are
 * not touched); the reset runs in the background and may fail, in which
 * case the failed job is in Failed jobs. Auditors read it and change nothing.
 */
export function LearningDataSection({ settings }: { settings: SettingsOut }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const toast = useToast();
  const net = useNeedsConnection("learning-offline");
  const refresh = useRefreshSettings();
  const reset = useStepUpCall(useResetFeedbackBuffer());
  // How many items the person was told would be cleared (set while asking).
  const [asking, setAsking] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Whether this view watched a reset run, so it can say it finished.
  const [watched, setWatched] = useState(false);
  const b = settings.feedback_buffer;

  const valid =
    Number.isInteger(b.waiting) &&
    b.waiting >= 0 &&
    (b.last_reset === null || Number.isInteger(b.last_reset.cleared));
  if (!valid)
    return (
      <SectionFailed
        title={LEARNING_TITLE}
        what={LEARNING_WHAT}
        onRetry={() => void refresh()}
      />
    );
  if (b.running && !watched) setWatched(true);

  const close = () => {
    setAsking(null);
    reset.clear();
  };
  const confirm = (input: StepUpInput) => {
    if (asking === null) return;
    reset.run(
      { reason: input.reason ?? "", ...codeOf(input) },
      {
        onSuccess: () => {
          close();
          toast.show({ title: "Clearing started", tone: "ok", live: "polite" });
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

  const l = b.last_reset;
  const line = "mt-1 text-[13.5px] text-ink-2 [overflow-wrap:anywhere]";

  return (
    <Section title={LEARNING_TITLE}>
      {refusal && (
        <div className="mb-3">
          <Banner tone="bad" title={refusal} />
        </div>
      )}
      <p className="text-[14px] font-semibold">{items(b.waiting)} waiting</p>
      {l && (
        <p className={line}>
          Cleared by {l.by.name} · {dateLabel(l.at)} · {items(l.cleared)} ·{" "}
          {l.reason}
        </p>
      )}
      {b.running ? (
        <p role="status" className={line}>
          Clearing…
        </p>
      ) : b.failed_job_id ? (
        <p role="status" className={line}>
          Couldn&apos;t clear ·{" "}
          <Link
            href="/system/jobs"
            className="font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            View in Failed jobs
          </Link>
        </p>
      ) : watched && l ? (
        <p role="status" className={line}>
          Cleared {items(l.cleared)} · {timeLabel(l.at)}
        </p>
      ) : null}
      {canAct && !b.running && b.waiting > 0 && (
        <div className="mt-3">
          <Button
            variant="danger"
            size="sm"
            {...net.props}
            onClick={() => {
              setRefusal(null);
              setAsking(b.waiting);
            }}
          >
            Clear
          </Button>
          <OfflineNote id="learning-offline" />
        </div>
      )}
      {canAct && (
        <StepUpDialog
          open={asking !== null}
          title={`Clear ${items(asking ?? 0)}?`}
          intro={
            <p>
              This clears {items(asking ?? 0)} of unapproved feedback. Approved
              corrections and guidelines are not touched. This can&apos;t be
              undone.
            </p>
          }
          freeReason
          dismissLabel="Cancel"
          confirmLabel={`Clear ${items(asking ?? 0)}`}
          tone="danger"
          busy={reset.busy}
          error={reset.error}
          onClose={close}
          onConfirm={confirm}
        />
      )}
    </Section>
  );
}
