"use client";
import { useEffect, useId, useState, type Ref } from "react";
import type { Person } from "@/lib/api/contract";
import { useHospitals } from "@/lib/queries/hospitals";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";

/**
 * Finds a hospital by name or short code. A removed hospital has nothing
 * left to hold, so it is never offered.
 */
export function HospitalPicker({
  value,
  onChange,
  error,
  inputRef,
}: {
  value: Person | null;
  onChange(h: Person | null): void;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const [text, setText] = useState("");
  // Ask the service once typing pauses, not on every key.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 200);
    return () => clearTimeout(t);
  }, [text]);
  const list = useHospitals({ q });
  if (value)
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-lilac-2 bg-white px-3.5 text-[14px]">
        <span className="font-semibold [overflow-wrap:anywhere]">
          {value.name}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  const rows = (list.data ?? []).filter((h) => h.status !== "removed");
  return (
    <div>
      <input
        ref={inputRef}
        id={`${id}-q`}
        type="search"
        aria-label="Search hospitals"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search by name or short code"
        className={inputClass}
      />
      {list.isError ? (
        <p role="alert" className="mt-1.5 text-[13px] text-bad">
          Couldn&apos;t load hospitals. Try again.
        </p>
      ) : list.isPending ? (
        <p role="status" className="mt-1.5 text-[13px] text-ink-3">
          Loading hospitals
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-ink-3">No hospitals match</p>
      ) : (
        <ul
          aria-label="Hospitals"
          className="mt-1.5 max-h-48 overflow-auto rounded-xl border border-lilac-2 bg-white"
        >
          {rows.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onChange({ id: h.id, name: h.name })}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 text-left text-[13.5px] hover:bg-lilac focus-visible:outline-2 focus-visible:outline-mint-deep"
              >
                <span className="[overflow-wrap:anywhere]">{h.name}</span>
                <span className="font-mono text-[12px] text-ink-3">
                  {h.short_code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
