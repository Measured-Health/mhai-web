import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  OctagonAlert,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import type {
  CorrectionOriginalOut,
  CorrectionStatus,
} from "@/lib/api/contract";
import { OVERDUE_LABEL, STATUS_VIEW, originalKind } from "@/lib/corrections";
import { RESULT_LABEL } from "@/lib/labels";
import { Chip } from "../ui/chip";

const STATUS_ICON = {
  pending_review: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  withdrawn: Undo2,
} as const;

const KIND = {
  high: { tone: "ok", Icon: ShieldCheck },
  caution: { tone: "warn", Icon: AlertTriangle },
  review: { tone: "bad", Icon: OctagonAlert },
} as const;

/** Waiting / Approved / Rejected / Withdrawn: always a word and an icon. */
export function StatusChip({ status }: { status: CorrectionStatus }) {
  const { label, tone } = STATUS_VIEW[status];
  const Icon = STATUS_ICON[status];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Chip>
  );
}

/** How the system rated its answer, in the result screen's words. */
export function OriginalChip({
  original,
  prefix = "",
}: {
  original: Pick<CorrectionOriginalOut, "decision" | "degraded">;
  prefix?: string;
}) {
  const kind = originalKind(original);
  const { tone, Icon } = KIND[kind];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {prefix}
      {RESULT_LABEL[kind]}
    </Chip>
  );
}

export function OverdueChip() {
  return (
    <Chip tone="bad">
      <Clock aria-hidden className="size-3" />
      {OVERDUE_LABEL}
      <span className="sr-only"> waiting</span>
    </Chip>
  );
}
