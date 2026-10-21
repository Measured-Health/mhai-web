import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { HospitalStatus } from "@/lib/api/contract";
import { statusLabel } from "@/lib/labels";
import { Chip } from "@mhai/ui/chip";

const LOOK: Record<
  HospitalStatus,
  { tone: "ok" | "warn" | "bad" | "muted"; Icon: LucideIcon }
> = {
  active: { tone: "ok", Icon: CheckCircle2 },
  setup_incomplete: { tone: "warn", Icon: CircleDashed },
  deactivated: { tone: "muted", Icon: Ban },
  removal_pending: { tone: "warn", Icon: Clock },
  removal_scheduled: { tone: "bad", Icon: Clock },
  removed: { tone: "muted", Icon: Trash2 },
};

/** The status as an icon and the word: never colour alone. */
export function StatusChip({ status }: { status: HospitalStatus }) {
  const { tone, Icon } = LOOK[status];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3.5" />
      {statusLabel(status)}
    </Chip>
  );
}
