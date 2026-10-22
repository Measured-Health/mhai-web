"use client";
import { Search } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import type { ConditionRef } from "@/lib/api/analysis-contract";
import { conditionText } from "@/lib/analysis/labels";
import { matchCondition } from "@/lib/analysis/filters";
import { cn } from "@mhai/ui/cn";

/**
 * Pick a condition by its name or ICD-10 code: a combobox with a listbox,
 * the arrow keys to move, Enter to pick and Esc to close. Emptying the box
 * means all conditions.
 */
export function ConditionSearch({
  conditions,
  value,
  onChange,
  disabled = false,
  describedBy,
  className,
}: {
  conditions: readonly ConditionRef[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const id = useId();
  const listId = useId();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = conditions.find((c) => c.id === value) ?? null;
  const text = editing ? query : selected ? conditionText(selected) : "";
  const matches = conditions.filter((c) => matchCondition(c, query));
  const current = Math.min(active, matches.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;
  const expanded = open && !disabled;

  function pick(c: ConditionRef) {
    onChange(c.id);
    setEditing(false);
    setOpen(false);
  }

  function close() {
    setEditing(false);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        if (!editing) setQuery("");
        setEditing(true);
        setOpen(true);
        setActive(0);
        return;
      }
      const n = matches.length;
      if (n === 0) return;
      const next = (current + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
      setActive(next);
      document
        .getElementById(optionId(next))
        ?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === "Enter") {
      if (open && matches[current]) {
        e.preventDefault();
        pick(matches[current]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    }
  }

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        Condition
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-3.5 size-4 text-ink-3"
      />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && current >= 0 ? optionId(current) : undefined
        }
        aria-describedby={describedBy}
        autoComplete="off"
        disabled={disabled}
        placeholder="All conditions"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setEditing(true);
          setQuery(v);
          setOpen(true);
          setActive(0);
          if (v.trim() === "" && value !== null) onChange(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
        className="min-h-11 w-full rounded-xl border border-lilac-2 bg-white pl-9 pr-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep disabled:opacity-40"
      />
      {expanded && matches.length === 0 && (
        <p
          role="status"
          className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-line bg-white px-3 py-2.5 text-[13px] text-ink-3 shadow-lg"
        >
          No condition matches
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label="Conditions"
        hidden={!expanded || matches.length === 0}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
      >
        {matches.map((c, i) => (
          <li
            key={c.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === current}
            // Keep focus in the box, so the pick isn't lost to a blur.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(c)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] [overflow-wrap:anywhere]",
              i === current && "bg-mint-wash",
            )}
          >
            {conditionText(c)}
          </li>
        ))}
      </ul>
    </div>
  );
}
