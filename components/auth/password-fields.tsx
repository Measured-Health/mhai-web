"use client";
import { Check, Circle } from "lucide-react";
import { useId } from "react";
import { passwordError, passwordRules } from "@/lib/auth/password-rules";
import { cn } from "../ui/cn";

export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[14.5px] focus-visible:outline-2 focus-visible:outline-mint-deep aria-invalid:border-bad";

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
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label
          htmlFor={`${id}-new`}
          className="mb-1.5 block text-[13px] font-semibold"
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
      <ul id={`${id}-rules`} aria-live="polite" className="flex flex-col gap-1">
        {rules.map((r) => (
          <li
            key={r.id}
            aria-label={`${r.label}: ${r.ok ? "met" : "not met"}`}
            className={cn(
              "flex items-center gap-2 text-[13px]",
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
          className="mb-1.5 block text-[13px] font-semibold"
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
