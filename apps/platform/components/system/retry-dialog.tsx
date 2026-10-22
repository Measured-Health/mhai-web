"use client";
import { useRef, useState } from "react";
import type { Job } from "@/lib/api/ops-contract";
import { platformError } from "@/lib/errors";
import { jobsCount, oldQuestions, resultLine } from "@/lib/ops/jobs";
import { useRetryJobs } from "@/lib/queries/ops";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

/** Asks before trying the chosen failed jobs again. No code is needed. */
export function RetryDialog({
  jobs,
  onClose,
  onDone,
}: {
  jobs: Job[];
  onClose(): void;
  /** Runs after a retry went through, before the dialog closes. */
  onDone?(): void;
}) {
  const retry = useRetryJobs();
  const toast = useToast();
  const net = useNeedsConnection("retry-offline");
  const keep = useRef<HTMLButtonElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  // Counted once, when the dialog opens.
  const [old] = useState(() => oldQuestions(jobs, Date.now()));
  const busy = retry.isPending;

  const confirm = () =>
    retry.mutate(
      jobs.map((j) => j.id),
      {
        onSuccess: (r) => {
          toast.show({
            title: resultLine(r.retried.length, r.skipped.length, "Retried"),
            tone: "ok",
            live: "polite",
          });
          onDone?.();
          onClose();
        },
      },
    );

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={`Retry ${jobsCount(jobs.length)}?`}
      initialFocus={old > 0 ? keep : go}
    >
      {old > 0 ? (
        <p className="mb-4 text-[14.5px] text-ink-2">
          {old} of these {old === 1 ? "questions was" : "questions were"} asked
          more than a day ago. The clinicians may have asked again or no longer
          need the answer.
        </p>
      ) : (
        <p className="mb-4 text-[14.5px] text-ink-2">
          These jobs will be tried again.
        </p>
      )}
      {retry.isError && (
        <div className="mb-3">
          <Banner tone="bad" title={platformError(retry.error).title}>
            {platformError(retry.error).body}
          </Banner>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button ref={keep} variant="ghost" disabled={busy} onClick={onClose}>
          Don&apos;t retry
        </Button>
        <Button ref={go} disabled={busy} {...net.props} onClick={confirm}>
          Retry
        </Button>
      </div>
      <OfflineNote id="retry-offline" />
    </Dialog>
  );
}
