import {
  CircleCheck,
  CircleQuestionMark,
  Clock,
  OctagonAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { COULDNT_CHECK, statusWords } from "@/lib/ops/labels";
import { timeLabel, type HealthState } from "@/lib/ops/health";
import type { PartStatus } from "@/lib/api/ops-contract";
import { cn } from "@mhai/ui/cn";

const ICON = {
  ok: CircleCheck,
  slow: Clock,
  problem: OctagonAlert,
  couldnt_check: CircleQuestionMark,
} as const;
const TONE = {
  ok: "text-ok",
  slow: "text-ink",
  problem: "text-bad",
  couldnt_check: "text-ink-2",
} as const;

/** A status as an icon and its words, never colour alone. */
export function StatusMark({
  status,
  className,
  children,
}: {
  status: PartStatus | "couldnt_check";
  className?: string;
  children?: ReactNode;
}) {
  const Icon = ICON[status];
  return (
    <span
      className={cn("inline-flex items-center gap-2", TONE[status], className)}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span>
        {children ??
          (status === "couldnt_check" ? COULDNT_CHECK : statusWords[status])}
      </span>
    </span>
  );
}

/** The whole system in one line; Couldn't check says when it last knew. */
export function OverallStatus({
  state,
  now,
  unread = state.overall === "couldnt_check",
}: {
  state: HealthState;
  now: number;
  /** Nothing of the reading can be shown (it is old, missing or failed). */
  unread?: boolean;
}) {
  return (
    <div>
      <p className="text-[20px] font-semibold">
        <StatusMark status={state.overall} />
      </p>
      {unread && (
        <p className="mt-1 text-[13.5px] text-ink-2">
          {state.lastGood
            ? `Last good reading ${timeLabel(state.lastGood, now)}`
            : "No reading yet"}
        </p>
      )}
    </div>
  );
}
