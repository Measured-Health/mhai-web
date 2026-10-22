"use client";
import { useId, useState, type KeyboardEvent } from "react";
import type { AuditPerson } from "@/lib/api/audit-contract";
import { ROLE_WORDS } from "@/lib/audit/kinds";
import { useAuditPeople } from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";

/** "Folake Adeyemi · Clinician · Havana Hospital · folake@hv.example". */
export const personLine = (p: AuditPerson): string =>
  `${p.name} · ${ROLE_WORDS[p.role]} · ${p.hospital?.name ?? "Measured Health"} · ${p.email}`;

const control =
  "min-h-11 w-full rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";

/**
 * Person: searches by name or email and keeps the chosen person's id, so two
 * people with the same name stay apart. A combobox with a listbox; the arrow
 * keys move, Enter picks, Escape closes.
 */
export function PersonPicker({
  value,
  onChange,
}: {
  value: AuditPerson | null;
  onChange(p: AuditPerson | null): void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const people = useAuditPeople(text);
  const term = text.trim();
  const list = term.length >= 2 ? (people.data ?? []) : [];
  const expanded = open && term.length >= 2;

  if (value)
    return (
      <div className="flex flex-col gap-1">
        <span id={`${id}-l`} className="text-[12px] font-semibold text-ink-2">
          Person
        </span>
        <div
          aria-labelledby={`${id}-l`}
          role="group"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-lilac-2 bg-white pl-3 pr-1 text-[13.5px]"
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {personLine(value)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Clear person"
            onClick={() => {
              setText("");
              onChange(null);
            }}
          >
            Clear
          </Button>
        </div>
      </div>
    );

  function choose(p: AuditPerson) {
    setOpen(false);
    setActive(-1);
    onChange(p);
  }

  function keys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!list.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + list.length) % list.length);
    } else if (e.key === "Enter" && expanded && list[active]) {
      e.preventDefault();
      choose(list[active]);
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  const status =
    term.length < 2
      ? null
      : people.isError
        ? "Couldn't search people. Try again."
        : people.data === undefined
          ? "Searching…"
          : list.length === 0
            ? "No one matches."
            : null;

  return (
    <div className="relative flex min-w-[220px] flex-col gap-1">
      <label
        htmlFor={`${id}-i`}
        className="text-[12px] font-semibold text-ink-2"
      >
        Person
      </label>
      <input
        id={`${id}-i`}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && list[active] ? `${id}-o-${active}` : undefined
        }
        value={text}
        placeholder="Name or email"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={keys}
        className={control}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="People"
        hidden={!expanded || list.length === 0}
        className="absolute left-0 top-full z-20 mt-1 max-h-72 w-[min(90vw,420px)] overflow-auto rounded-xl border border-lilac-2 bg-white py-1 shadow-lg"
      >
        {list.map((p, i) => (
          <li
            key={p.id}
            id={`${id}-o-${i}`}
            role="option"
            aria-selected={i === active}
            // Keep focus in the input, so the click lands before blur closes.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(p)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] [overflow-wrap:anywhere]",
              i === active ? "bg-mint-wash" : "hover:bg-bg",
            )}
          >
            {personLine(p)}
          </li>
        ))}
      </ul>
      {expanded && status && (
        <p role="status" className="text-[12.5px] text-ink-3">
          {status}
        </p>
      )}
    </div>
  );
}
