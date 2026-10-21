import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldOff,
  type LucideIcon,
} from "lucide-react";
import type { TeamMember } from "@/lib/api/contract";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";
import { dateLabel } from "../hospitals/format";

export const OWN_ROW_NOTE =
  "You can't change your own role or remove yourself. Another platform admin can.";

export const signInLabel = (iso: string | null) =>
  iso ? dateLabel(iso) : "Not yet";

/** Active or Invite pending: an icon and the words, never colour alone. */
export function MemberStatus({ status }: { status: TeamMember["status"] }) {
  const active = status === "active";
  const Icon: LucideIcon = active ? CheckCircle2 : Clock;
  return (
    <Chip tone={active ? "ok" : "warn"}>
      <Icon aria-hidden className="size-3.5" />
      {active ? "Active" : "Invite pending"}
    </Chip>
  );
}

/** Two-step On or Off, with an icon. */
export function TwoStep({ on }: { on: boolean }) {
  const Icon: LucideIcon = on ? ShieldCheck : ShieldOff;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-4" />
      {on ? "On" : "Off"}
    </span>
  );
}

export type RowHandlers = {
  /** Platform admins only; auditors see the list. */
  canAct: boolean;
  /** Offline: the buttons' disabled/title/aria-describedby. */
  netProps: {
    disabled?: boolean;
    title?: string;
    "aria-describedby"?: string;
  };
  onRole(m: TeamMember): void;
  onRemove(m: TeamMember): void;
};

/** Change role (not on your own row) and Remove for one member. */
export function RowActions({ m, h }: { m: TeamMember; h: RowHandlers }) {
  const size = "sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {m.is_you ? (
        <span className="text-[12px] text-ink-3">{OWN_ROW_NOTE}</span>
      ) : (
        <>
          <Button
            size={size}
            variant="ghost"
            aria-label={`Change role for ${m.name}`}
            {...h.netProps}
            onClick={() => h.onRole(m)}
          >
            Change role
          </Button>
          <Button
            size={size}
            variant="danger"
            aria-label={`Remove ${m.name}`}
            {...h.netProps}
            onClick={() => h.onRemove(m)}
          >
            Remove
          </Button>
        </>
      )}
    </div>
  );
}
