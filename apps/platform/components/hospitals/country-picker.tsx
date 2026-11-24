"use client";
import { useState } from "react";
import {
  countries,
  countryName,
  matchCountries,
  type Country,
} from "@/lib/countries";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { cn } from "@mhai/ui/cn";

const SHOWN = 50;
const fold = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * Country: a combobox searched by name (or by its 2-letter code). It shows
 * the name and keeps the code; typing clears the choice until a country is
 * picked from the list, or the text is exactly one country's name.
 */
export function CountryPicker({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  /** The input's id, for its label and for moving focus to it. */
  id: string;
  /** The chosen code, or "" when none. */
  value: string;
  onChange(code: string): void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [text, setText] = useState(() => (value ? countryName(value) : ""));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = matchCountries(text).slice(0, SHOWN);
  const showList = open && !disabled;
  const listId = `${id}-list`;

  const pick = (c: Country) => {
    onChange(c.code);
    setText(c.name);
    setOpen(false);
  };
  /** The one country this text names exactly, if any. */
  const exact = (t: string) => {
    const q = fold(t);
    return countries().find(
      (c) => fold(c.name) === q || c.code.toLowerCase() === q,
    );
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        type="text"
        autoComplete="off"
        placeholder="Search by name"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && matches[active] ? `${id}-o${active}` : undefined
        }
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          setActive(0);
          setOpen(true);
          onChange(exact(t)?.code ?? "");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          const c = exact(text);
          if (c) setText(c.name);
        }}
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
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg"
        >
          {matches.length === 0 && (
            <li className="px-3.5 py-2.5 text-[13px] text-ink-3">
              No country matches
            </li>
          )}
          {matches.map((c, i) => (
            <li
              key={c.code}
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
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
