"use client";
import { useState } from "react";
import {
  CalendarClock,
  Hourglass,
  Lock,
  LockOpen,
  type LucideIcon,
} from "lucide-react";
import type { LegalHold, HoldStatus as Status } from "@/lib/api/holds-contract";
import { holdStatusLabel } from "@/lib/holds/labels";
import { liftedLine } from "@/lib/holds/rules";
import { Chip } from "@mhai/ui/chip";

const LOOK: Record<
  Status,
  { tone: "brand" | "warn" | "muted"; Icon: LucideIcon }
> = {
  active: { tone: "brand", Icon: Lock },
  review_due: { tone: "warn", Icon: CalendarClock },
  lift_requested: { tone: "warn", Icon: Hourglass },
  lifted: { tone: "muted", Icon: LockOpen },
};

/**
 * A hold's status as an icon and words: never colour alone. `text`
 * replaces the words (e.g. a hold's page says who placed it).
 */
export function HoldStatus({ hold, text }: { hold: LegalHold; text?: string }) {
  const { tone, Icon } = LOOK[hold.status];
  const [now] = useState(() => Date.now());
  return (
    <Chip tone={tone} className="text-left">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {text ??
        (hold.status === "lifted"
          ? liftedLine(hold, now)
          : holdStatusLabel(hold.status))}
    </Chip>
  );
}
