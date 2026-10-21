import { Check } from "lucide-react";
import type { TeamRole } from "@/lib/api/contract";
import { ROLES, roleLabel } from "@/lib/labels";

/** Role choice as pills (radios): the chosen one has a tick, not just colour. */
export function RoleFields({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: TeamRole;
  onChange(r: TeamRole): void;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold">Role</legend>
      <div className="flex flex-wrap gap-1.5">
        {ROLES.map((r) => (
          <label key={r} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={r}
              checked={value === r}
              disabled={disabled}
              onChange={() => onChange(r)}
              className="peer sr-only"
            />
            <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-lilac-2 bg-white px-3 text-[12.5px] text-ink-2 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9">
              {value === r && <Check aria-hidden className="size-3.5" />}
              {roleLabel(r)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
