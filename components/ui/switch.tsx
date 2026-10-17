"use client";
import { cn } from "./cn";

/** An on/off switch with the word "On" or "Off" beside it, never colour alone. */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  describedBy,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-2 text-[13px] text-ink-2",
        disabled && "opacity-50",
      )}
    >
      {/* The real control sits, transparent, over the track: clickable and labelled. */}
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-describedby={describedBy}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 rounded-full bg-lilac-2 transition-colors duration-[var(--t-fast)] after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-[var(--t-fast)] peer-checked:bg-mint peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep"
        />
      </span>
      <span aria-hidden>{checked ? "On" : "Off"}</span>
    </label>
  );
}
