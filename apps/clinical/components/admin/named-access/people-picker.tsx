"use client";
import { useId } from "react";
import type { StaffOut } from "@/lib/api/admin-contract";
import { eligibility } from "@/lib/clearances/eligibility";

/** The staff a letter can cover, from a list of everyone. */
export const eligibleIds = (staff: StaffOut[]) =>
  new Set(staff.filter((s) => eligibility(s).ok).map((s) => s.id));

/**
 * The hospital's staff as checkboxes. Anyone a letter can't cover is greyed
 * out with the reason; the server still has the last word.
 */
export function PeoplePicker({
  staff,
  selected,
  onChange,
  disabled,
}: {
  staff: StaffOut[];
  selected: readonly string[];
  onChange(ids: string[]): void;
  disabled?: boolean;
}) {
  const id = useId();
  const rows = staff
    .map((s) => ({ s, e: eligibility(s) }))
    // Those who can be picked first, then by name.
    .sort(
      (a, b) =>
        Number(b.e.ok) - Number(a.e.ok) ||
        a.s.full_name.localeCompare(b.s.full_name),
    );
  const n = selected.length;
  return (
    <fieldset>
      <legend className="text-[12.5px] font-semibold text-ink-2">
        People covered
      </legend>
      <p className="text-[12px] text-ink-3">
        Active hospital admins and Analysts with two-step on.
      </p>
      <ul
        aria-label="Staff"
        className="mt-1 flex max-h-60 flex-col overflow-auto rounded-xl border border-lilac-2"
      >
        {rows.map(({ s, e }) => {
          const name = `${id}-${s.id}-name`;
          const reason = e.ok ? null : `${id}-${s.id}-why`;
          return (
            <li key={s.id} className="border-t border-line first:border-t-0">
              <label
                className={`flex min-h-11 items-center gap-2.5 px-3 py-1.5 text-[14px] ${e.ok ? "" : "text-ink-3"}`}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-mint"
                  disabled={disabled || !e.ok}
                  checked={e.ok && selected.includes(s.id)}
                  aria-labelledby={name}
                  aria-describedby={reason ?? undefined}
                  onChange={() =>
                    onChange(
                      selected.includes(s.id)
                        ? selected.filter((x) => x !== s.id)
                        : [...selected, s.id],
                    )
                  }
                />
                <span
                  id={name}
                  className="min-w-0 flex-1 [overflow-wrap:anywhere]"
                >
                  {s.full_name}
                </span>
                {!e.ok && (
                  <span id={reason!} className="text-[12px]">
                    {e.reason}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="mt-1 text-[12px] text-ink-3">
        {n === 1 ? "1 person picked" : `${n} people picked`}
      </p>
    </fieldset>
  );
}
