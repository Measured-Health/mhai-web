"use client";
import { ExternalLink, MapPin, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { AlertOut, DismissIn } from "@/lib/api/alerts-contract";
import { isAlertHandled } from "@/lib/api/errors";
import { useOnline } from "@/lib/hooks/use-online";
import {
  useAcknowledgeAlert,
  useDismissAlert,
} from "@/lib/notification-queries";
import {
  findingLine,
  handledLine,
  likelyCauses,
  locationLabel,
  recordLink,
  recordedLabel,
} from "@/lib/notifications/alert-view";
import { askFromAlert, stashPrefill } from "@/lib/notifications/ask";
import { eventClock } from "@/lib/time";
import { useShell } from "../shell/shell-context";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import {
  AlertStatusChip,
  CauseChip,
  NotStandardisedChip,
  SeverityChip,
} from "./chips";
import { DismissDialog } from "./dismiss-dialog";

/** The card's DOM id, so a "View" can bring it into view. Never in the URL (R3). */
export const alertDomId = (id: string) => `alert-${id}`;

type Problem = "conflict" | "failed" | null;

/** Someone else got there first, or the save just failed. */
const classify = (e: Error): Exclude<Problem, null> =>
  isAlertHandled(e) ? "conflict" : "failed";

/**
 * One patient alert, in the spec's order (§3): severity, the finding, likely
 * causes suggested by MHAI, the patient and where they are, then the actions.
 */
export function AlertCard({
  alert,
  now,
  showSource,
}: {
  alert: AlertOut;
  now: number;
  showSource: boolean;
}) {
  const ack = useAcknowledgeAlert();
  const dismiss = useDismissAlert();
  const online = useOnline();
  const { navigate } = useShell();
  const ids = useId();
  const [dismissing, setDismissing] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const handledRef = useRef<HTMLParagraphElement>(null);
  // Set before an action; the handled line takes the focus once it is there
  // and no dialog is still open (R6): a closing dialog would take it back.
  const focusHandled = useRef(false);

  const closed = alert.status !== "new";
  // Closed by someone else, not by your own dismiss landing: while yours is
  // in flight or done, the alert is closed because of you (F15).
  const gone = closed && !dismiss.isPending && !dismiss.isSuccess;
  const handled = handledLine(alert, now);
  const recorded = recordedLabel(alert.finding, now);
  const causes = likelyCauses(alert);
  const link = recordLink(alert.emr_link);
  const busy = ack.isPending || dismiss.isPending;
  // A disabled action always says why (Global Constraints).
  const why = closed
    ? `${ids}-handled`
    : !online
      ? `${ids}-offline`
      : undefined;

  const settled = closed && !dismissing;
  useEffect(() => {
    if (!settled || !focusHandled.current) return;
    focusHandled.current = false;
    handledRef.current?.focus();
  }, [settled]);

  const failed = (e: Error) => {
    const p = classify(e);
    // Only a conflict leaves a handled line to move to.
    if (p === "failed") focusHandled.current = false;
    setProblem(p);
  };
  const acknowledge = () => {
    setProblem(null);
    focusHandled.current = true;
    ack.mutate(alert.id, { onError: failed });
  };
  const submitDismiss = (d: DismissIn) => {
    setProblem(null);
    focusHandled.current = true;
    dismiss.mutate(
      { id: alert.id, d },
      {
        onSuccess: () => setDismissing(false),
        // The dialog stays open and says why, so the focus stays in it.
        onError: (e) => {
          focusHandled.current = false;
          setProblem(classify(e));
        },
      },
    );
  };
  // The prefill waits in memory; the URL carries only a random token (R3, R11).
  const ask = () =>
    navigate(`/?prefill=${stashPrefill(askFromAlert(alert, now))}`);

  return (
    <>
      <article
        id={alertDomId(alert.id)}
        tabIndex={-1}
        aria-labelledby={`${ids}-finding ${ids}-patient`}
        className="card-v3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep md:px-[22px]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={alert.severity} />
          <AlertStatusChip status={alert.status} />
          {showSource && alert.source_label && (
            <Chip tone="muted">
              <span className="sr-only">Source: </span>
              <span className="[overflow-wrap:anywhere]">
                {alert.source_label}
              </span>
            </Chip>
          )}
          <span className="ml-auto font-mono text-[11.5px] text-ink-3">
            {eventClock(alert.created_at, now)}
          </span>
        </div>
        <h3
          id={`${ids}-finding`}
          className="mt-2.5 text-[15px] font-semibold [overflow-wrap:anywhere]"
        >
          {findingLine(alert.finding)}
          {recorded && (
            <>
              {" "}
              <span className="font-normal text-ink-3">· {recorded}</span>
            </>
          )}
        </h3>
        {!alert.finding.standardised && (
          <div className="mt-1.5">
            <NotStandardisedChip />
          </div>
        )}
        {causes.length > 0 && (
          <section
            aria-labelledby={`${ids}-causes`}
            className="mt-3 rounded-2xl bg-lilac px-3.5 py-3"
          >
            <h4
              id={`${ids}-causes`}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-bloom"
            >
              <Sparkles aria-hidden className="size-3.5" />
              Likely causes · Suggested by MHAI
            </h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {causes.map((c) => (
                <li
                  key={c.label}
                  className="flex flex-wrap items-center gap-2 text-[13.5px]"
                >
                  <span className="[overflow-wrap:anywhere]">{c.label}</span>
                  <CauseChip level={c.level} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-ink-3">
              Suggestions to check, not a diagnosis.
            </p>
          </section>
        )}
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13.5px]">
          <dt className="text-ink-3">Patient</dt>
          <dd
            id={`${ids}-patient`}
            className="font-semibold [overflow-wrap:anywhere]"
          >
            {alert.patient.full_name}
          </dd>
          <dt className="text-ink-3">MRN</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">
            {alert.patient.mrn}
          </dd>
          <dt className="text-ink-3">Where</dt>
          <dd className="flex items-start gap-1 [overflow-wrap:anywhere]">
            <MapPin
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-ink-3"
            />
            {locationLabel(alert.patient.location)}
          </dd>
        </dl>
        {handled && (
          <p
            ref={handledRef}
            id={`${ids}-handled`}
            tabIndex={-1}
            className="mt-3 text-[13px] font-semibold text-ink-2 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            {handled}
          </p>
        )}
        {problem === "conflict" && (
          <div className="mt-3">
            <Banner tone="warn" title="Someone else handled this alert">
              Nothing more to do here. Your action wasn&apos;t recorded.
            </Banner>
          </div>
        )}
        {problem === "failed" && !dismissing && (
          <div className="mt-3">
            <Banner tone="bad" title="Couldn't save that">
              Check your connection and try again.
            </Banner>
          </div>
        )}
        {!online && !closed && (
          <p id={`${ids}-offline`} className="mt-3 text-[13px] text-ink-3">
            You&apos;re offline. Acknowledge and Dismiss need a connection.
          </p>
        )}
        <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            size="sm"
            disabled={closed || busy || !online}
            aria-describedby={why}
            onClick={acknowledge}
          >
            Acknowledge
          </Button>
          <Button size="sm" variant="soft" onClick={ask}>
            Ask MHAI about it
          </Button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-9"
            >
              Open patient record
              <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={closed || busy || !online}
            aria-describedby={why}
            onClick={() => {
              setProblem(null);
              setDismissing(true);
            }}
          >
            Dismiss
          </Button>
        </div>
      </article>
      {dismissing && (
        <DismissDialog
          open
          patient={alert.patient.full_name}
          gone={gone}
          busy={dismiss.isPending}
          failed={problem === "failed"}
          offline={!online}
          onClose={() => {
            // Closed after someone else handled it: the line says who.
            if (closed) focusHandled.current = true;
            setDismissing(false);
          }}
          onSubmit={submitDismiss}
        />
      )}
    </>
  );
}
