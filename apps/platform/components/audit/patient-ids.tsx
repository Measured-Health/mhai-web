"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { patientsKey, useAuditPatients } from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";

/** The ids while shown. Mounted only then: leaving forgets them. */
function Ids({ id, onHide }: { id: string; onHide(): void }) {
  const q = useAuditPatients(id, true);
  if (q.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p>Couldn&apos;t load the patient ids.</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={onHide}>
            Hide patient ids
          </Button>
        </div>
      </div>
    );
  if (!q.data) return <p role="status">Loading patient ids…</p>;
  return (
    <div className="flex flex-col items-start gap-2">
      <ul aria-label="Patient ids" className="font-mono text-[12.5px]">
        {q.data.map((p) => (
          <li key={p} className="[overflow-wrap:anywhere]">
            {p}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-2">Shown to you and recorded.</p>
      <Button variant="ghost" size="sm" onClick={onHide}>
        Hide patient ids
      </Button>
    </div>
  );
}

/**
 * "Patients: {count}", with the ids only on request. Showing them is a
 * recorded request; the result lives in this component's state and the
 * cache only while shown, never in storage or the URL.
 */
export function PatientIds({ id, count }: { id: string; count: number }) {
  const qc = useQueryClient();
  const [shown, setShown] = useState(false);

  function hide() {
    setShown(false);
    qc.removeQueries({ queryKey: patientsKey(id) });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p>Patients: {count}</p>
      {shown ? (
        <Ids id={id} onHide={hide} />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setShown(true)}>
          Show patient ids
        </Button>
      )}
    </div>
  );
}
