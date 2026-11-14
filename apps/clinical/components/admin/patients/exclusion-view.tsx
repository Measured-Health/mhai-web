"use client";
import { useId, useState } from "react";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useNetwork } from "@mhai/api-client/network";
import {
  EXCLUSION_INTRO,
  EXCLUSION_REASON,
  patientError,
} from "@/lib/admin/patient-words";
import {
  EXCLUSION_REASONS,
  type ExclusionOut,
  type ExclusionReason,
} from "@/lib/api/patients-contract";
import { useExcludePatient } from "@/lib/patients-queries";
import { AdminFrame } from "../admin-frame";
import { StepUpDialog } from "./step-up-dialog";

const MRN_MAX = 64;

/** What happened, from the reply: deleted now, or kept under a legal hold. */
export function ExclusionResult({ r }: { r: ExclusionOut }) {
  return r.purge_held ? (
    <Banner tone="warn" title="Patient excluded. Their data is kept for now.">
      MHAI no longer uses this patient&apos;s records and their open alerts were
      withdrawn. A legal hold is open on the hospital, so the record data MHAI
      holds for them is kept until the hold is lifted. It is deleted within 24
      hours of that.
    </Banner>
  ) : (
    <Banner tone="ok" title="Patient excluded and their data deleted">
      MHAI no longer uses this patient&apos;s records, their open alerts were
      withdrawn, and the record data MHAI held for them has been deleted.
    </Banner>
  );
}

/**
 * Exclude a patient from MHAI's use of the hospital's records, by MRN. The
 * MRN stays in this form's state only, and is cleared once it's done.
 */
export function ExclusionView() {
  const exclude = useExcludePatient();
  const { online } = useNetwork();
  const mrnId = useId();
  const hintId = useId();
  const reasonName = useId();
  const [mrn, setMrn] = useState("");
  const [reason, setReason] = useState<ExclusionReason | null>(null);
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<ExclusionOut | null>(null);
  const value = mrn.trim();
  const complete = value.length > 0 && value.length <= MRN_MAX && !!reason;

  return (
    <AdminFrame title="Patient exclusions">
      <div className="flex max-w-[760px] flex-col gap-4">
        <p className="text-[14px] text-ink-2">{EXCLUSION_INTRO}</p>
        {result && <ExclusionResult r={result} />}
        <form
          noValidate
          className="card-v3 flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (complete && online) {
              setResult(null);
              setAsking(true);
            }
          }}
        >
          <h3 className="text-[14px] font-semibold">Exclude a patient</h3>
          <label
            htmlFor={mrnId}
            className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-2"
          >
            The patient&apos;s MRN
            <input
              id={mrnId}
              value={mrn}
              maxLength={MRN_MAX}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={hintId}
              onChange={(e) => setMrn(e.target.value)}
              className="min-h-11 max-w-80 rounded-xl border border-lilac-2 bg-white px-3 text-[14px] font-normal text-ink focus-visible:outline-2 focus-visible:outline-mint-deep"
            />
          </label>
          <p id={hintId} className="-mt-2 text-[12.5px] text-ink-3">
            As it appears in the hospital&apos;s own record.
          </p>
          <fieldset>
            <legend className="mb-1 text-[12.5px] font-semibold text-ink-2">
              Why
            </legend>
            {EXCLUSION_REASONS.map((r) => (
              <label
                key={r}
                className="flex min-h-11 items-center gap-2 text-[14px]"
              >
                <input
                  type="radio"
                  name={reasonName}
                  className="size-4 accent-mint"
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {EXCLUSION_REASON[r]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={!complete || !online}
            >
              Exclude patient…
            </Button>
            {!online && (
              <span className="text-[12.5px] text-ink-3">
                You&apos;re offline. This needs a connection.
              </span>
            )}
          </div>
        </form>
      </div>
      {asking && reason && (
        <StepUpDialog
          title="Exclude this patient?"
          confirmLabel="Exclude patient"
          busy={exclude.isPending}
          toError={(e) => patientError(e, "exclusion")}
          onClose={() => {
            exclude.reset();
            setAsking(false);
          }}
          send={(auth, done) =>
            exclude.mutate(
              { body: { mrn: value, reason }, auth },
              {
                onSettled: () => exclude.reset(),
                onSuccess: (r) => {
                  done();
                  setResult(r);
                  setMrn("");
                  setReason(null);
                  setAsking(false);
                },
                onError: (e) => done(e),
              },
            )
          }
        >
          <p>For the patient with MRN {value}:</p>
          <ul className="mt-2 list-disc pl-5">
            <li>MHAI stops using their records, now and from now on.</li>
            <li>Their open alerts are withdrawn at once.</li>
            <li>
              The record data MHAI holds for them is deleted. If a legal hold is
              open on the hospital, it is kept until the hold is lifted.
            </li>
          </ul>
          <p className="mt-2">This can&apos;t be undone here.</p>
        </StepUpDialog>
      )}
    </AdminFrame>
  );
}
