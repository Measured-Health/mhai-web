"use client";
import { useState } from "react";

const SUGGEST = [
  "Shortness of breath",
  "Fever",
  "Nausea",
  "Headache",
  "Dizziness",
  "Abdominal pain",
];

export function SymptomInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string[];
  onChange(v: string[]): void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = (s: string) => {
    const t = s.trim();
    if (t && !value.includes(t) && value.length < 20) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div>
      <div
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-white px-3 py-2 ${invalid ? "border-bad ring-4 ring-bad/10" : "border-lilac-2 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/15"}`}
      >
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-mint-wash px-2.5 py-1 text-[12.5px] text-mint-deep"
          >
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => onChange(value.filter((x) => x !== s))}
              className="relative after:absolute after:-inset-3 after:content-['']"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              (e.key === "Enter" || e.key === ",") &&
              !e.metaKey &&
              !e.ctrlKey
            ) {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && value.length)
              onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : "Type and press Enter…"}
          className="min-w-32 flex-1 bg-transparent text-[14px] outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGEST.filter((s) => !value.includes(s))
          .slice(0, 4)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-lilac-2 bg-white px-2.5 py-1 text-xs text-ink-2 max-md:min-h-11"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}
