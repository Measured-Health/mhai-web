import {
  CheckCircle2,
  Clock,
  Flag,
  ShieldAlert,
  TriangleAlert,
  UserX,
} from "lucide-react";
import type { StaffOut, StaffRole } from "@/lib/api/admin-contract";
import { FLAG_LABEL } from "@/lib/admin/activity";
import {
  ROLE_LABEL,
  STAFF_STATE,
  staffState,
  statusText,
} from "@/lib/admin/staff";
import { Chip } from "../ui/chip";

const STATE_ICON = {
  active: CheckCircle2,
  invited: Clock,
  attention: TriangleAlert,
  deactivated: UserX,
} as const;

/** Status as a word and an icon (spec §7); the problem itself when there is one. */
export function StaffStatusChip({
  staff,
  now,
}: {
  staff: StaffOut;
  now: number;
}) {
  const state = staffState(staff, now);
  const Icon = STATE_ICON[state];
  return (
    <Chip tone={STAFF_STATE[state].tone}>
      <Icon aria-hidden className="size-3.5" />
      {statusText(staff, now)}
    </Chip>
  );
}

export function RoleChips({ roles }: { roles: StaffRole[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Chip key={r} tone={r === "hospital_admin" ? "mint" : "brand"}>
          {ROLE_LABEL[r]}
        </Chip>
      ))}
    </span>
  );
}

export function FlagChip({ flag }: { flag: "policy" | "alert" }) {
  const Icon = flag === "alert" ? ShieldAlert : Flag;
  return (
    <Chip tone={flag === "alert" ? "bad" : "warn"}>
      <Icon aria-hidden className="size-3.5" />
      {FLAG_LABEL[flag]}
    </Chip>
  );
}
