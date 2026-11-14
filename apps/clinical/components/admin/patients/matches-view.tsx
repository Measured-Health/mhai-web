"use client";
import { useId, useState } from "react";
import { useToast } from "@mhai/ui/toast";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { useNow } from "@mhai/ui/hooks/use-now";
import { useNetwork } from "@mhai/api-client/network";
import { adminError } from "@/lib/admin/errors";
import {
  MATCH_REASON,
  MATCHES_INTRO,
  patientError,
} from "@/lib/admin/patient-words";
import type { PatientMatchOut } from "@/lib/api/patients-contract";
import { useDecideMatch, usePatientMatches } from "@/lib/patients-queries";
import { eventClock } from "@/lib/time";
import { AdminFrame } from "../admin-frame";
import { PatientCard } from "./patient-card";
import { StepUpDialog } from "./step-up-dialog";

type Pending = { match: PatientMatchOut; decision: "confirm" | "reject" };

/** The merge: which record stays, and what moves to it. */
function MergeDialog({
  match,
  onClose,
}: {
  match: PatientMatchOut;
  onClose(): void;
}) {
  const decide = useDecideMatch();
  const toast = useToast();
  const name = useId();
  const [keep, setKeep] = useState<"a" | "b" | null>(null);
  const kept = keep ? match[keep] : null;
  const other = keep ? match[keep === "a" ? "b" : "a"] : null;
  return (
    <StepUpDialog
      title="Merge these two patients?"
      confirmLabel="Merge patients"
      ready={keep !== null}
      busy={decide.isPending}
      toError={(e) => patientError(e, "match")}
      onClose={onClose}
      send={(auth, done) => {
        if (!keep) return done();
        decide.mutate(
          { id: match.id, decision: "confirm", keep, auth },
          {
            onSettled: () => decide.reset(),
            onSuccess: () => {
              done();
              toast.show({
                title: "Patients merged",
                body: "Their records are now under one patient.",
                tone: "ok",
              });
              onClose();
            },
            onError: (e) => {
              done(e);
              if (patientError(e, "match").gone) onClose();
            },
          },
        );
      }}
    >
      <p>
        Choose the patient to keep. The other patient&apos;s records, findings
        and alerts move to them, and the other patient is no longer listed on
        their own. Only Measured Health can undo a merge.
      </p>
      <fieldset className="mt-3">
        <legend className="mb-1 font-semibold text-ink">Keep</legend>
        {(["a", "b"] as const).map((side) => (
          <label
            key={side}
            className="flex min-h-11 items-center gap-2 text-[14px] text-ink"
          >
            <input
              type="radio"
              name={name}
              className="size-4 accent-mint"
              checked={keep === side}
              onChange={() => setKeep(side)}
            />
            {side === "a" ? "Patient A" : "Patient B"}: {match[side].full_name}
            {match[side].mrn ? ` (MRN ${match[side].mrn})` : ""}
          </label>
        ))}
      </fieldset>
      {kept && other && (
        <p className="mt-2 text-[13px]">
          {other.full_name}&apos;s {other.records}{" "}
          {other.records === 1 ? "record moves" : "records move"} to{" "}
          {kept.full_name}.
        </p>
      )}
    </StepUpDialog>
  );
}

function RejectDialog({
  match,
  onClose,
}: {
  match: PatientMatchOut;
  onClose(): void;
}) {
  const decide = useDecideMatch();
  const toast = useToast();
  return (
    <StepUpDialog
      title="Keep these as two patients?"
      confirmLabel="Not the same patient"
      busy={decide.isPending}
      toError={(e) => patientError(e, "match")}
      onClose={onClose}
      send={(auth, done) =>
        decide.mutate(
          { id: match.id, decision: "reject", auth },
          {
            onSettled: () => decide.reset(),
            onSuccess: () => {
              done();
              toast.show({
                title: "Kept as two patients",
                body: "This pair won't be suggested again for the same reason.",
                tone: "ok",
              });
              onClose();
            },
            onError: (e) => {
              done(e);
              if (patientError(e, "match").gone) onClose();
            },
          },
        )
      }
    >
      <p>
        {match.a.full_name} and {match.b.full_name} stay separate patients.
        Nothing about their records changes, and this pair won&apos;t be
        suggested again for the same reason.
      </p>
    </StepUpDialog>
  );
}

function MatchItem({
  match,
  now,
  onDecide,
  offline,
}: {
  match: PatientMatchOut;
  now: number;
  onDecide(d: Pending["decision"]): void;
  offline: boolean;
}) {
  const heading = useId();
  return (
    <li aria-labelledby={heading} className="card-v3 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 id={heading} className="text-[14px] font-semibold">
          {MATCH_REASON[match.reason]}
        </h3>
        <span className="text-[12.5px] text-ink-3">
          Found {eventClock(match.proposed_at, now)}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <PatientCard label="Patient A" p={match.a} />
        <PatientCard label="Patient B" p={match.b} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={offline}
          onClick={() => onDecide("confirm")}
        >
          Same patient: merge
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={offline}
          onClick={() => onDecide("reject")}
        >
          Not the same patient
        </Button>
      </div>
    </li>
  );
}

/** Possible duplicate patients, waiting for a hospital admin's decision. */
export function MatchesView() {
  const q = usePatientMatches();
  const now = useNow(60_000);
  const { online } = useNetwork();
  const [pending, setPending] = useState<Pending | null>(null);
  const failed = q.isError && !q.data ? adminError(q.error) : null;
  const list = q.data?.matches;
  return (
    <AdminFrame title="Patient matches">
      <div className="flex max-w-[860px] flex-col gap-4">
        <p className="text-[14px] text-ink-2">{MATCHES_INTRO}</p>
        {failed && (
          <Banner tone="bad" title="Couldn't load patient matches">
            {failed.body}
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </span>
          </Banner>
        )}
        {!list &&
          !failed &&
          (q.fetchStatus === "paused" ? (
            <div
              role="status"
              className="card-v3 p-6 text-center text-[14px] text-ink-2"
            >
              You&apos;re offline. This needs a connection.
            </div>
          ) : (
            <Skeleton className="h-64 rounded-2xl" />
          ))}
        {list && list.length === 0 && (
          <div
            role="status"
            className="card-v3 p-6 text-center text-[14px] text-ink-2"
          >
            No possible matches are waiting.
          </div>
        )}
        {list && list.length > 0 && (
          <ul aria-label="Possible matches" className="flex flex-col gap-3">
            {list.map((m) => (
              <MatchItem
                key={m.id}
                match={m}
                now={now}
                offline={!online}
                onDecide={(decision) => setPending({ match: m, decision })}
              />
            ))}
          </ul>
        )}
      </div>
      {pending?.decision === "confirm" && (
        <MergeDialog match={pending.match} onClose={() => setPending(null)} />
      )}
      {pending?.decision === "reject" && (
        <RejectDialog match={pending.match} onClose={() => setPending(null)} />
      )}
    </AdminFrame>
  );
}
