"use client";
import { useId, useState } from "react";
import { NOTE_MAX } from "@mhai/ui/clearances";
import { ApiError } from "@mhai/api-client/errors";
import type { StepUp } from "@/lib/api/clearances-contract";
import { adminError, type AdminError } from "@/lib/admin/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { errorText } from "@/lib/clearances/summary";
import type { StepUpState } from "../step-up-fields";

const fieldText =
  "w-full rounded-xl border border-lilac-2 bg-white px-3 py-2 text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-mint-deep";

/**
 * What a letter write (revoke, narrow) shows after an answer. After any
 * refusal the code is cleared: a wrong one with the focus back in the box,
 * anything else so a new code is asked for. A 409 reads "Changed by someone
 * else"; the letter itself reloads after every write (`useLetterWrite`).
 */
export function useLetterAnswer(step: StepUpState) {
  const { user, updateUser } = useAuth();
  const [error, setError] = useState<AdminError | null>(null);
  const [wrongCode, setWrongCode] = useState(false);
  const [required, setRequired] = useState(false);
  return {
    error,
    wrongCode,
    /** This admin has no two-step, so no code can be entered. */
    blocked: required || user?.mfaEnabled === false,
    clear() {
      setError(null);
      setWrongCode(false);
    },
    require: () => setRequired(true),
    refused(e: unknown, nameOf?: (id: string) => string | undefined) {
      const wrong = e instanceof ApiError && e.code === "mfa_invalid";
      const stale = e instanceof ApiError && e.code === "conflict";
      setError({
        ...adminError(e),
        title: errorText(e, nameOf),
        body: stale
          ? "The letter has been loaded again. Check it and try again."
          : wrong
            ? adminError(e).body
            : "",
      });
      setWrongCode(wrong);
      if (wrong) step.wrong();
      else step.setCode("");
    },
    /** A backup code works once; Profile & security shows what's left. */
    spent(auth: StepUp) {
      if ("backupCode" in auth && user?.backupCodesLeft != null)
        updateUser({ backupCodesLeft: Math.max(0, user.backupCodesLeft - 1) });
    },
  };
}

/** A reason as radios, then a note: needed for Other, 500 characters at most. */
export function ReasonFields<R extends string>({
  legend,
  labels,
  reasons,
  reason,
  onReason,
  note,
  onNote,
  busy,
}: {
  legend: string;
  labels: Record<R, string>;
  reasons: readonly R[];
  reason: R | null;
  onReason(r: R): void;
  note: string;
  onNote(n: string): void;
  busy: boolean;
}) {
  const name = useId();
  const noteId = useId();
  const hintId = useId();
  return (
    <div className="mt-4 flex flex-col gap-3 text-ink">
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
          {legend}
        </legend>
        {reasons.map((r) => (
          <label key={r} className="flex min-h-11 items-center gap-2.5">
            <input
              type="radio"
              name={name}
              className="size-4 accent-mint"
              checked={reason === r}
              disabled={busy}
              onChange={() => onReason(r)}
            />
            {labels[r]}
          </label>
        ))}
      </fieldset>
      <div>
        <label
          htmlFor={noteId}
          className="block text-[12.5px] font-semibold text-ink-2"
        >
          Note
        </label>
        <textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          disabled={busy}
          aria-describedby={hintId}
          aria-required={reason === "other" ? true : undefined}
          onChange={(e) => onNote(e.target.value)}
          className={`${fieldText} mt-1`}
        />
        <p id={hintId} className="mt-1 text-[12px] text-ink-3">
          {reason === "other"
            ? `Needed for Other. Up to ${NOTE_MAX} characters.`
            : `Optional. Up to ${NOTE_MAX} characters.`}
        </p>
      </div>
    </div>
  );
}
