"use client";
import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPlatformClient } from "@/lib/api/client";
import { isAuditor, useAuth } from "@/lib/auth/auth-context";
import { PSEUDONYM } from "@/lib/api/audit-contract";
import { Button } from "@mhai/ui/button";
import { Dialog } from "@mhai/ui/dialog";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

/** The most pseudonyms one entry's list may send (core 1.19.0). */
export const PATIENTS_MAX = 200;

/** Said before and after a reveal: core records every one. */
export const REVEAL_AUDITED =
  "Revealing these patients is itself recorded in the audit log, under your name.";
export const AUDITORS_ONLY = "Only an auditor can reveal these patients.";

type Shown =
  | { s: "hidden" }
  | { s: "loading" }
  | { s: "error" }
  | { s: "shown"; ids: string[] };

/**
 * "Patients: {count}", with the ids only on an auditor's request, after a
 * confirmation saying the reveal is recorded. Each Reveal is one recorded
 * request (`GET /platform/audit/{id}/patients`), sent from the confirm. The
 * result lives in this component's state only: it is never put in the query
 * cache (so no invalidation or refetch can send it again), storage or the
 * URL, and leaving (Hide, Close, a tab switch, unmounting) drops it. A reply
 * that isn't a list of at most 200 pseudonyms reads as an error, never a
 * partial list.
 */
export function PatientIds({ id, count }: { id: string; count: number }) {
  const { user } = useAuth();
  const auditor = isAuditor(user);
  const [state, setState] = useState<Shown>({ s: "hidden" });
  const [asking, setAsking] = useState(false);
  const net = useNeedsConnection(`patients-offline-${id}`);
  const confirmNet = useNeedsConnection(`patients-confirm-offline-${id}`);
  /** Bumped by Hide and unmount: a late reply for an older click is dropped. */
  const ticket = useRef(0);
  useEffect(() => {
    const t = ticket;
    return () => {
      t.current++;
    };
  }, []);

  function reveal() {
    setAsking(false);
    const mine = ++ticket.current;
    setState({ s: "loading" });
    getPlatformClient()
      .getAuditPatients(id)
      .then(
        (r) => {
          if (ticket.current !== mine) return;
          const list = r?.pseudonyms;
          const ok =
            Array.isArray(list) &&
            list.length <= PATIENTS_MAX &&
            list.every((p) => typeof p === "string" && PSEUDONYM.test(p)) &&
            new Set(list).size === list.length;
          setState(ok ? { s: "shown", ids: [...list] } : { s: "error" });
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

  const ask = (
    <Button
      variant="ghost"
      size="sm"
      disabled={net.offline}
      onClick={() => setAsking(true)}
      {...net.props}
    >
      Reveal patients
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <p>Patients: {count}</p>
      {!auditor ? (
        <p className="text-[12.5px] text-ink-2">{AUDITORS_ONLY}</p>
      ) : (
        <>
          {state.s === "hidden" && (
            <>
              {ask}
              <OfflineNote id={`patients-offline-${id}`} />
            </>
          )}
          {state.s === "loading" && <p role="status">Loading patient ids…</p>}
          {state.s === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p>Couldn&apos;t load the patient ids.</p>
              <div className="flex gap-2">
                {/* A second request is the person's choice, and is recorded. */}
                {ask}
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
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
                Shown to you and recorded.
              </p>
              <Button variant="ghost" size="sm" onClick={hide}>
                Hide patient ids
              </Button>
            </>
          )}
          <Dialog
            open={asking}
            onClose={() => setAsking(false)}
            title="Reveal these patients?"
          >
            <p className="mb-2 text-[14.5px] text-ink-2">
              You&apos;ll see the de-identified patient ids this list showed (
              {count}). Names and record numbers are never shown.
            </p>
            <p className="mb-[18px] flex items-start gap-1.5 text-[14.5px] text-ink-2">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              {REVEAL_AUDITED}
            </p>
            <OfflineNote id={`patients-confirm-offline-${id}`} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={confirmNet.offline}
                {...confirmNet.props}
                onClick={reveal}
              >
                Reveal patients
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  );
}
