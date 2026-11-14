"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { getLookupClient } from "@/lib/api/lookup";
import { MRN_MAX, mrnProblem } from "@/lib/api/lookup-schema";
import type { PatientLink } from "@/lib/patient-link";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";

type Problem =
  | "empty"
  | "invalid"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "mfa"
  | "error";

/** What each refusal says: plain words, never core's own text. */
const SAYS: Record<Problem, ReactNode> = {
  empty: "Enter the patient's full MRN.",
  invalid: `An MRN has letters and numbers, and may have spaces, dots, slashes or hyphens: up to ${MRN_MAX} characters.`,
  not_found: "No active patient with that MRN in your hospital.",
  conflict: "More than one patient has that MRN; ask your records team.",
  rate_limited: (
    <>
      Too many lookups for now; try again later.{" "}
      <span className="text-ink-2">
        You can look up patients 5 times a minute and 50 times a day, and your
        hospital has a daily limit too. Lookups that find no one count as well.
      </span>
    </>
  ),
  unavailable:
    "Couldn't look up the patient just now. Wait a moment, then press Find again.",
  mfa: "Finding a patient by MRN needs two-step sign-in on your account.",
  error: "Couldn't look up the patient. Check the MRN and try again.",
};

function problemOf(e: unknown): Problem {
  if (!(e instanceof ApiError)) return "error";
  if (e.status === 404) return "not_found";
  if (e.status === 409) return "conflict";
  if (e.status === 429) return "rate_limited";
  if (e.status === 0 || e.status === 503) return "unavailable";
  if (e.status === 403 && e.code === "mfa_required") return "mfa";
  return "error";
}

const input =
  "w-full rounded-xl border bg-white px-3.5 py-2.5 font-mono text-[15px] outline-none transition-shadow duration-[var(--t-fast)] focus:border-mint focus:ring-4 focus:ring-mint/15";

/**
 * "Find patient by MRN": the clinician types the whole MRN and presses Find
 * (never search-as-you-type: every lookup counts towards their limits).
 * The MRN and the answer are held in this component's state only, so a
 * cleared form (a remount) or a sign-out forgets them. On a hit the box is
 * emptied and the patient handed up for "About patient".
 */
export function PatientFinder({
  onFound,
}: {
  onFound(patient: PatientLink): void;
}) {
  const [mrn, setMrn] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const box = useRef<HTMLInputElement>(null);
  // A lookup that answers after the form was cleared or the person signed
  // out is dropped.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refuse = (p: Problem) => {
    setProblem(p);
    // A refused field takes the focus.
    box.current?.focus();
  };

  const find = async () => {
    if (busy) return;
    const bad = mrnProblem(mrn);
    if (bad) return refuse(bad);
    setBusy(true);
    setProblem(null);
    try {
      const p = await getLookupClient().lookupPatient(mrn);
      if (!mounted.current) return;
      setMrn("");
      setBusy(false);
      onFound({
        id: p.id,
        name: p.full_name ?? "Name not recorded",
        mrn: p.mrn,
      });
    } catch (e) {
      if (!mounted.current) return;
      setBusy(false);
      refuse(problemOf(e));
    }
  };

  return (
    <div id="f-mrn-lookup" className="mb-3.5">
      <label
        htmlFor="mrn-lookup"
        className="mb-1.5 block text-[12.5px] text-ink-2"
      >
        Find patient by MRN
      </label>
      <div className="flex gap-2">
        <input
          ref={box}
          id="mrn-lookup"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          readOnly={busy}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "e-mrn-lookup" : "h-mrn-lookup"}
          value={mrn}
          onChange={(e) => {
            setMrn(e.target.value);
            if (problem) setProblem(null);
          }}
          onKeyDown={(e) => {
            // Enter finds; it never sends the question.
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              void find();
            }
          }}
          className={cn(
            input,
            problem ? "border-bad ring-4 ring-bad/10" : "border-lilac-2",
          )}
        />
        <Button
          type="button"
          variant="soft"
          disabled={busy}
          onClick={() => void find()}
        >
          <Search aria-hidden className="size-4" />
          {busy ? "Finding…" : "Find"}
        </Button>
      </div>
      <div aria-live="polite">
        {problem && (
          <p id="e-mrn-lookup" className="mt-1.5 text-[12.5px] text-bad">
            ✕ {SAYS[problem]}
          </p>
        )}
      </div>
      {!problem && (
        <p id="h-mrn-lookup" className="mt-1.5 text-xs text-ink-3">
          Type the full MRN, then press Find. Optional: it links the question to
          the patient.
        </p>
      )}
    </div>
  );
}
