import { Ban, CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { formatWhen } from "@/lib/activity-labels";
import type { Job, JobStatus } from "@/lib/api/ops-contract";
import { statusLine } from "@/lib/ops/jobs";
import { errorKindLabel, jobStatusLabel, jobTypeLabel } from "@/lib/ops/labels";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";

const ICON = {
  failed: CircleAlert,
  retrying: RefreshCw,
  retried: CircleCheck,
  cancelled: Ban,
} as const;
const TONE = {
  failed: "bad",
  retrying: "warn",
  retried: "ok",
  cancelled: "muted",
} as const;

/** The status in words with an icon, never colour alone. */
export function JobStatusChip({ job }: { job: Job }) {
  const s: JobStatus = job.status;
  const Icon = ICON[s];
  return (
    <Chip tone={TONE[s]}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {statusLine(job, jobStatusLabel[s])}
    </Chip>
  );
}

export const whatLabel = (j: Job) => jobTypeLabel[j.type];
export const hospitalLabel = (j: Job) => j.hospital?.name ?? "Platform";
export const whyLabel = (j: Job) => errorKindLabel[j.kind];
export const when = formatWhen;

/** The opaque reference and a button that copies it. */
export function Reference({
  job,
  onCopy,
}: {
  job: Job;
  onCopy(id: string): void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <code className="font-mono text-[12px] [overflow-wrap:anywhere]">
        {job.id}
      </code>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Copy reference ${job.id}`}
        onClick={() => onCopy(job.id)}
      >
        Copy
      </Button>
    </span>
  );
}

export type JobListProps = {
  rows: Job[];
  /** Only a platform admin can choose jobs. */
  canChoose: boolean;
  chosen: ReadonlySet<string>;
  onToggle(id: string): void;
  onCopy(id: string): void;
};

export function Choose({
  job,
  chosen,
  onToggle,
}: {
  job: Job;
  chosen: boolean;
  onToggle(id: string): void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={`Choose ${whatLabel(job)} ${job.id}`}
      checked={chosen}
      onChange={() => onToggle(job.id)}
      className="size-5 accent-bloom"
    />
  );
}
