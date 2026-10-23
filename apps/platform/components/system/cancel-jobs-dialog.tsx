"use client";
import type { CancelReason, Job } from "@/lib/api/ops-contract";
import {
  cancelEffects,
  jobsCount,
  resultLine,
  resultTone,
} from "@/lib/ops/jobs";
import { useCancelJobs } from "@/lib/queries/ops";
import { useStepUpCall } from "@/lib/queries/step-up-call";
import { useToast } from "@mhai/ui/toast";
import {
  codeOf,
  StepUpDialog,
  type StepUpInput,
} from "../hospitals/step-up-dialog";

const REASONS: { code: CancelReason; label: string }[] = [
  { code: "no_longer_needed", label: "No longer needed" },
  { code: "cant_succeed", label: "Can't succeed" },
  { code: "other", label: "Other" },
];

/** Cancels the chosen failed jobs, with the person's two-step code. */
export function CancelJobsDialog({
  jobs,
  onClose,
  onDone,
}: {
  jobs: Job[];
  onClose(): void;
  onDone?(): void;
}) {
  const cancel = useCancelJobs();
  const run = useStepUpCall(cancel);
  const toast = useToast();

  const close = () => {
    run.clear();
    onClose();
  };
  const confirm = (input: StepUpInput) => {
    const code = codeOf(input);
    run.run(
      {
        ids: jobs.map((j) => j.id),
        reason: input.reason as CancelReason,
        ...(input.note ? { note: input.note } : {}),
        ...code,
      },
      {
        onSuccess: (r) => {
          toast.show({
            title: resultLine(
              r.cancelled.length,
              r.skipped.length,
              "Cancelled",
            ),
            tone: resultTone(r.cancelled.length),
            live: "polite",
          });
          onDone?.();
          close();
        },
      },
    );
  };

  return (
    <StepUpDialog
      open
      title={`Cancel ${jobsCount(jobs.length)}?`}
      intro={
        <>
          <ul className="list-disc pl-5">
            {cancelEffects(jobs).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-2">Cancelled jobs are kept as a record.</p>
        </>
      }
      reasons={REASONS}
      noteFor="other"
      dismissLabel="Keep"
      confirmLabel="Cancel jobs"
      tone="danger"
      busy={run.busy}
      error={run.error}
      onClose={close}
      onConfirm={confirm}
    />
  );
}
