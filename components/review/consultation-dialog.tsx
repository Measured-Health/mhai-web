"use client";
import type { CorrectionOut } from "@/lib/api/contract";
import { OriginalChip } from "../corrections/chips";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const SEX = {
  female: "female",
  male: "male",
  other: "other",
  unknown: "sex not given",
} as const;
const URGENCY = {
  routine: "Routine",
  urgent: "Urgent",
  emergency: "Emergency",
} as const;
const H =
  "mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3";

/** Read only (R7): built from the correction, because the reviewer can't open /c/{id}. */
export function ConsultationDialog({
  c,
  mine,
  open,
  onClose,
}: {
  c: CorrectionOut;
  mine: boolean;
  open: boolean;
  onClose(): void;
}) {
  const q = c.consultation;
  return (
    <Dialog open={open} onClose={onClose} title="The consultation">
      {open && (
        <>
          <p className="text-[13px] text-ink-3">
            {mine ? "Your consultation, as you asked it." : "Read only."}
          </p>
          <div className="max-h-[60vh] overflow-auto text-[14px] [overflow-wrap:anywhere]">
            <h3 className={H}>As asked</h3>
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-1.5 text-[13.5px]">
              <dt className="text-ink-3">Patient</dt>
              <dd>
                {q.age} years, {SEX[q.sex]}
              </dd>
              <dt className="text-ink-3">Symptoms</dt>
              <dd>{q.symptoms.join(", ") || "None given"}</dd>
              <dt className="text-ink-3">Urgency</dt>
              <dd>{URGENCY[q.urgency]}</dd>
              {q.specialty && (
                <>
                  <dt className="text-ink-3">Specialty</dt>
                  <dd>{q.specialty}</dd>
                </>
              )}
            </dl>
            <p className="mt-2 whitespace-pre-line">{q.clinical_question}</p>
            <h3 className={H}>What the system said</h3>
            <OriginalChip original={c.original} prefix="Original: " />
            {c.original.diagnosis && (
              <p className="mt-2 font-semibold">{c.original.diagnosis}</p>
            )}
            <p className="mt-1 whitespace-pre-line text-ink-2">
              {c.original.response_text}
            </p>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
