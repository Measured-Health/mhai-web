"use client";
import { Check, Circle } from "lucide-react";
import { useId } from "react";
import { passwordError, passwordRules } from "@mhai/api-client/password-rules";
import { cn } from "../cn";

export const inputClass =
  "min-h-11 w-full rounded-xl border border-lilac-2 bg-white px-3.5 text-[14px] focus-visible:border-mint focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mint/25 aria-invalid:border-bad";

/** New password + confirm, with the design's live rule ticks (8c). */
export function PasswordFields({
  next,
  confirm,
  onNext,
  onConfirm,
  identity,
  showErrors,
}: {
  next: string;
  confirm: string;
  onNext(v: string): void;
  onConfirm(v: string): void;
  identity: string | null;
  showErrors: boolean;
}) {
  const id = useId();
  const rules = passwordRules(next, identity);
  const error = showErrors ? passwordError(next, confirm, identity) : null;
  const mismatch = error === "The passwords don't match.";
  // The meter (design 8c): one segment per rule met, the fourth for a long
  // password (16+) that meets them all. The ticks below carry the meaning.
  const met = rules.filter((r) => r.ok).length;
  const strength = met + (met === rules.length && next.length >= 16 ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label
          htmlFor={`${id}-new`}
          className="mb-1.5 block text-[12.5px] text-ink-2"
        >
          New password
        </label>
        <input
          id={`${id}-new`}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => onNext(e.target.value)}
          aria-describedby={`${id}-rules`}
          aria-invalid={error && !mismatch ? true : undefined}
          className={inputClass}
        />
      </div>
      <div aria-hidden className="-mt-1 flex gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < strength ? "bg-mint" : "bg-lilac-2",
            )}
          />
        ))}
      </div>
      <ul
        id={`${id}-rules`}
        aria-live="polite"
        className="-mt-1 flex flex-wrap gap-x-3 gap-y-1"
      >
        {rules.map((r) => (
          <li
            key={r.id}
            aria-label={`${r.label}: ${r.ok ? "met" : "not met"}`}
            className={cn(
              "flex items-center gap-1 text-[12px]",
              r.ok ? "text-ok-deep" : "text-ink-3",
            )}
          >
            {r.ok ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <Circle aria-hidden className="size-3.5" />
            )}
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <div>
        <label
          htmlFor={`${id}-confirm`}
          className="mb-1.5 block text-[12.5px] text-ink-2"
        >
          Confirm password
        </label>
        <input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          aria-invalid={mismatch ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={inputClass}
        />
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
