"use client";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

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
  describedBy,
}: {
  describedBy?: string;
  id: string;
  value: string[];
  onChange(v: string[]): void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Returns true when added. On failure the draft is kept and a message shown.
  const add = (s: string, fromDraft: boolean): boolean => {
    const t = s.trim();
    if (!t) {
      if (fromDraft) setDraft("");
      return false;
    }
    if (t.length > 200) {
      setMsg("Keep each symptom to 200 characters or fewer");
      return false;
    }
    if (value.includes(t)) {
      setMsg("Already added");
      return false;
    }
    if (value.length >= 20) {
      setMsg("Up to 20 symptoms");
      return false;
    }
    onChange([...value, t]);
    setMsg("");
    if (fromDraft) setDraft("");
    return true;
  };
  return (
    <div>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-white px-3 py-2 ${invalid ? "border-bad ring-4 ring-bad/10" : "border-lilac-2 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/15"}`}
      >
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-mint-wash px-2.5 py-1 text-[12.5px] text-mint-deep max-md:min-h-11 max-md:pl-3"
          >
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => onChange(value.filter((x) => x !== s))}
              className="flex size-6 items-center justify-center max-md:-mr-2.5 max-md:size-11"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={draft}
          aria-invalid={invalid || msg ? true : undefined}
          aria-describedby={
            [msg ? `${id}-msg` : "", describedBy ?? ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(e) => {
            setDraft(e.target.value);
            setMsg("");
          }}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter submits the form: commit the typed symptom first
            // (synchronously, so the form submits with it). If it can't be
            // added, the draft and its message stay and the submit is blocked.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
              let added = false;
              flushSync(() => {
                added = value.includes(draft.trim()) || add(draft, true);
                if (added) {
                  setDraft("");
                  setMsg("");
                }
              });
              if (!added) {
                e.preventDefault();
                e.stopPropagation();
              }
              return;
            }
            if (
              (e.key === "Enter" || e.key === ",") &&
              !e.metaKey &&
              !e.ctrlKey
            ) {
              e.preventDefault();
              add(draft, true);
            }
            if (e.key === "Backspace" && !draft && value.length)
              onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft, true)}
          placeholder={value.length ? "" : "Type and press Enter…"}
          className="min-w-32 flex-1 bg-transparent text-[14px] outline-none"
        />
      </div>
      {msg && (
        <p
          id={`${id}-msg`}
          role="status"
          className="mt-1.5 text-[12.5px] text-bad"
        >
          {msg}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGEST.filter((s) => !value.includes(s))
          .slice(0, 4)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s, false)}
              className="rounded-full border border-dashed border-lilac-2 bg-white px-2.5 py-1 text-xs text-ink-2 max-md:min-h-11"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}
