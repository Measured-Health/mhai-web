import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  CircleHelp,
  CircleSlash,
  Info,
  OctagonAlert,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import type {
  AlertOut,
  AlertStatus,
  CauseConfidence,
} from "@/lib/api/alerts-contract";
import { RESULT_LABEL } from "@/lib/labels";
import {
  ALERT_STATUS_LABEL,
  NOT_STANDARDISED,
  ROUTE_LABEL,
  routingOf,
  SEVERITY,
  severityOf,
} from "@/lib/notifications/alert-view";
import { Chip } from "@mhai/ui/chip";

export const SEVERITY_ICON = {
  critical: OctagonAlert,
  urgent: AlertTriangle,
  info: Info,
} as const;

/** Critical / Urgent / Info: always a word and an icon, never colour alone. */
export function SeverityChip({ severity }: { severity: string }) {
  const s = severityOf(severity);
  const Icon = SEVERITY_ICON[s];
  return (
    <Chip tone={SEVERITY[s].tone}>
      <Icon aria-hidden className="size-3" />
      {SEVERITY[s].label}
    </Chip>
  );
}

const STATUS = {
  new: { tone: "brand", Icon: CircleDot },
  handled: { tone: "ok", Icon: CheckCircle2 },
  dismissed: { tone: "muted", Icon: CircleSlash },
} as const;

/** New / Handled / Dismissed, with an icon. */
export function AlertStatusChip({ status }: { status: AlertStatus }) {
  const { tone, Icon } = STATUS[status];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {ALERT_STATUS_LABEL[status]}
    </Chip>
  );
}

/** An unmapped finding (ADR 0003): shown, never hidden or guessed. */
export function NotStandardisedChip() {
  return (
    <Chip tone="muted">
      <CircleHelp aria-hidden className="size-3" />
      {NOT_STANDARDISED}
    </Chip>
  );
}

const CAUSE = {
  high: { tone: "ok", Icon: ShieldCheck },
  caution: { tone: "warn", Icon: AlertTriangle },
  review: { tone: "bad", Icon: OctagonAlert },
} as const;

/** A suggested cause's confidence, in the result labels' words (spec §6). */
export function CauseChip({ level }: { level: CauseConfidence }) {
  const { tone, Icon } = CAUSE[level];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {RESULT_LABEL[level]}
    </Chip>
  );
}

/** Who the alert was sent to: "For you" or "Hospital queue", with an icon. */
export function RouteChip({ alert }: { alert: Pick<AlertOut, "routing"> }) {
  const toYou = routingOf(alert).to_you;
  const Icon = toYou ? UserRound : Users;
  return (
    <Chip tone={toYou ? "brand" : "muted"}>
      <Icon aria-hidden className="size-3" />
      {toYou ? ROUTE_LABEL.you : ROUTE_LABEL.queue}
    </Chip>
  );
}
