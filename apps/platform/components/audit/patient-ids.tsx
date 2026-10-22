"use client";
import { useEffect, useRef, useState } from "react";
import { getPlatformClient } from "@/lib/api/client";
import { ID } from "@/lib/audit/read";
import { Button } from "@mhai/ui/button";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

/** The most pseudonyms one entry may list. */
const PATIENTS_MAX = 10_000;

type Shown =
  | { s: "hidden" }
  | { s: "loading" }
  | { s: "error" }
  | { s: "shown"; ids: string[] };

/**
 * "Patients: {count}", with the ids only on request. Each Show is one
 * recorded request, sent from the click. The result lives in this
 * component's state only: it is never put in the query cache (so no
 * invalidation or refetch can send it again), storage or the URL, and
 * leaving (Hide, Close, a tab switch, unmounting) drops it.
 */
export function PatientIds({ id, count }: { id: string; count: number }) {
  const [state, setState] = useState<Shown>({ s: "hidden" });
  const net = useNeedsConnection(`patients-offline-${id}`);
  /** Bumped by Hide and unmount: a late reply for an older click is dropped. */
  const ticket = useRef(0);
  useEffect(() => {
    const t = ticket;
    return () => {
      t.current++;
    };
  }, []);

  function show() {
    const mine = ++ticket.current;
    setState({ s: "loading" });
    getPlatformClient()
      .getAuditPatients(id)
      .then(
        (r) => {
          if (ticket.current !== mine) return;
          const ids = Array.isArray(r?.pseudonyms)
            ? r.pseudonyms
                .filter((p) => typeof p === "string" && ID.test(p))
                .slice(0, PATIENTS_MAX)
            : [];
          setState({ s: "shown", ids });
        },
        () => {
          if (ticket.current === mine) setState({ s: "error" });
        },
      );
  }

  function hide() {
    ticket.current++;
    setState({ s: "hidden" });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p>Patients: {count}</p>
      {state.s === "hidden" && (
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={net.offline}
            onClick={show}
            {...net.props}
          >
            Show patient ids
          </Button>
          <OfflineNote id={`patients-offline-${id}`} />
        </>
      )}
      {state.s === "loading" && <p role="status">Loading patient ids…</p>}
      {state.s === "error" && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>Couldn&apos;t load the patient ids.</p>
          <div className="flex gap-2">
            {/* A second request is the person's choice, and is recorded. */}
            <Button
              variant="ghost"
              size="sm"
              disabled={net.offline}
              onClick={show}
              {...net.props}
            >
              Try again
            </Button>
            <Button variant="ghost" size="sm" onClick={hide}>
              Hide patient ids
            </Button>
          </div>
        </div>
      )}
      {state.s === "shown" && (
        <>
          <ul aria-label="Patient ids" className="font-mono text-[12.5px]">
            {state.ids.map((p) => (
              <li key={p} className="[overflow-wrap:anywhere]">
                {p}
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-ink-2">Shown to you and recorded.</p>
          <Button variant="ghost" size="sm" onClick={hide}>
            Hide patient ids
          </Button>
        </>
      )}
    </div>
  );
}
