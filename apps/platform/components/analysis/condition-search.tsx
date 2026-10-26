"use client";
import { X } from "lucide-react";
import { useId, useState } from "react";
import type { ConditionRef } from "@/lib/api/analysis-contract";
import { matchCondition } from "@/lib/analysis/filters";
import { conditionText } from "@/lib/analysis/labels";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { cn } from "@mhai/ui/cn";

const SHOWN = 8;
/** A set condition whose name isn't (or isn't yet) in the choices. */
const CONDITION_SET = "Condition set";

/**
 * The condition filter: a combobox over the scope's conditions, searched on
 * the device by name or ICD-10 code. Once one is set it shows as a chip
 * with Remove.
 */
export function ConditionSearch({
  conditions,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  conditions: ConditionRef[];
  value: string | null;
  onChange(id: string | null): void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = value ? conditions.find((c) => c.id === value) : undefined;

  if (value !== null) {
    const label = chosen ? conditionText(chosen) : CONDITION_SET;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[12.5px] font-semibold text-ink-2">
          Condition
        </span>
        <span className="inline-flex min-h-11 items-center gap-1 self-start rounded-full bg-lilac pl-3.5 text-[13px] font-semibold text-bloom">
          {label}
          <button
            type="button"
            aria-label={`Remove ${label}`}
            disabled={disabled}
            onClick={() => onChange(null)}
            className="grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-mint-deep disabled:opacity-40"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </span>
      </div>
    );
  }

  const matches = conditions
    .filter((c) => matchCondition(c, text))
    .slice(0, SHOWN);
  const showList = open && !disabled && text.trim() !== "";
  const pick = (c: ConditionRef) => {
    onChange(c.id);
    setText("");
    setOpen(false);
  };
  return (
    <div className="relative flex flex-col gap-1">
      <label
        htmlFor={`${id}-in`}
        className="text-[12.5px] font-semibold text-ink-2"
      >
        Condition
      </label>
      <input
        id={`${id}-in`}
        role="combobox"
        type="text"
        autoComplete="off"
        placeholder="Name or ICD-10 code"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && matches[active] ? `${id}-o${active}` : undefined
        }
        aria-describedby={describedBy}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && showList && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={inputClass}
      />
      {showList && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Conditions"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {matches.length === 0 && (
            <li className="px-3.5 py-2.5 text-[13px] text-ink-3">
              No condition matches
            </li>
          )}
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the box, so the list doesn't close first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center px-3.5 text-[13.5px]",
                i === active && "bg-mint-wash",
              )}
            >
              {conditionText(c)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
