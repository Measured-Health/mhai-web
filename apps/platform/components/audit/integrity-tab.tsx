"use client";
import { useEffect, useId, useState } from "react";
import { formatWhen } from "@/lib/activity-labels";
import {
  SHOWN_WORDS,
  breakRange,
  coverageLine,
  integrityOf,
  runSentence,
} from "@/lib/audit/integrity";
import type { ReadRun } from "@/lib/audit/read";
import { isAuditor, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import {
  findEntryAt,
  useIntegrityStatus,
  useRefreshIntegrity,
  useRun,
  useStartCheck,
} from "@/lib/queries/audit";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { useNow } from "@mhai/ui/hooks/use-now";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { OutcomeNote } from "./outcome-note";
import { RunHistory, SHOWN_LOOK } from "./run-history";

/** What step 5 hands to the export dialog. */
export type ExportPrefill = {
  reason: "security_investigation";
  filters: { from: string; to: string };
};

const startedMs = (r: ReadRun) =>
  r.started_at === null ? -Infinity : Date.parse(r.started_at);
/** The run that started later; `a` wins a tie. */
const newer = (a: ReadRun | null, b: ReadRun | null) =>
  !a ? b : !b ? a : startedMs(b) > startedMs(a) ? b : a;

/** "Checked {when} · by {name | the daily schedule}" ("Started" while running). */
function checkedLine(run: ReadRun): string | null {
  const who = run.by ? run.by.name : "the daily schedule";
  if (run.state === "running")
    return run.started_at
      ? `Started ${formatWhen(run.started_at)} · by ${who}`
      : null;
  const at = run.finished_at ?? run.started_at;
  return at ? `Checked ${formatWhen(at)} · by ${who}` : null;
}

/** The state block: icon and title, the sentence, coverage and age. */
function StateBlock({
  run,
  now,
  onRetry,
  retry,
}: {
  run: ReadRun | null;
  now: number;
  onRetry(): void;
  retry: { disabled?: boolean; title?: string; "aria-describedby"?: string };
}) {
  const shown = run ? integrityOf(run, now) : null;
  const look = shown ? SHOWN_LOOK[shown] : SHOWN_LOOK.couldnt_check;
  const cover = run ? coverageLine(run) : null;
  const checked = run ? checkedLine(run) : null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Integrity status"
      className="flex flex-col gap-1.5"
    >
      <p
        className={cn(
          "flex items-center gap-2 text-lg font-semibold",
          look.className,
        )}
      >
        <look.Icon aria-hidden className="size-5 shrink-0" />
        <span>{shown ? SHOWN_WORDS[shown] : "Not checked yet"}</span>
      </p>
      <p className="text-[14px]">
        {run ? runSentence(run, now) : "No check has run yet."}
      </p>
      {cover && <p className="text-[13.5px] text-ink-2">{cover}</p>}
      {checked && <p className="text-[13px] text-ink-3">{checked}</p>}
      {shown === "couldnt_check" && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            {...retry}
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** Step 2: the first broken entry, with Copy and Open entry. */
function FirstBroken({
  run,
  onOpenEntry,
}: {
  run: ReadRun;
  onOpenEntry(id: string): void;
}) {
  const net = useNeedsConnection("open-entry-offline");
  const [copied, setCopied] = useState<"no" | "yes" | "failed">("no");
  const [opening, setOpening] = useState<"idle" | "busy" | "failed">("idle");
  const seq = run.first_broken_seq;
  const at = run.first_broken_at;
  if (seq === null)
    return (
      <p className="mt-1 text-ink-3">
        The check didn&apos;t name the first broken entry.
      </p>
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(seq));
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  };
  const open = async () => {
    if (!at) return;
    setOpening("busy");
    try {
      const id = await findEntryAt(seq, at);
      if (id === null) throw new Error("not found");
      setOpening("idle");
      onOpenEntry(id);
    } catch {
      setOpening("failed");
    }
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-white px-2 py-1 font-mono text-[13.5px]">
          {`#${seq}`}
        </code>
        <Button variant="ghost" size="sm" onClick={() => void copy()}>
          Copy
        </Button>
        {at && (
          <Button
            variant="ghost"
            size="sm"
            {...net.props}
            disabled={net.offline || opening === "busy"}
            onClick={() => void open()}
          >
            Open entry
          </Button>
        )}
        <span role="status" className="text-[13px] text-ink-3">
          {copied === "yes"
            ? "Copied"
            : copied === "failed"
              ? "Couldn't copy. Select the number instead."
              : ""}
        </span>
      </div>
      <OfflineNote id="open-entry-offline" />
      {opening === "failed" && (
        <p role="alert" className="text-[13px] text-bad-deep">
          {`Couldn't open entry #${seq}. Try again.`}
        </p>
      )}
    </div>
  );
}

/** The auditor's steps on a failed check (spec §8.3), in order. */
function Steps({
  run,
  contact,
  onOpenEntry,
  onExport,
}: {
  run: ReadRun;
  contact: { name: string; email: string } | null;
  onOpenEntry(id: string): void;
  onExport?: (p: ExportPrefill) => void;
}) {
  const titleId = useId();
  const { user } = useAuth();
  const exportAround = () => {
    const filters = breakRange(run, Date.now());
    if (filters && onExport)
      onExport({ reason: "security_investigation", filters });
  };
  return (
    <section aria-labelledby={titleId} className="card-v3 px-[22px] py-5">
      <h2 id={titleId} className="text-base font-semibold">
        What to do now
      </h2>
      <ol
        aria-labelledby={titleId}
        className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-[14px] marker:font-semibold"
      >
        <li>
          Don&apos;t treat later entries as evidence until the failure is
          explained.
        </li>
        <li>
          Note the first broken entry and open it to see what it was.
          <FirstBroken run={run} onOpenEntry={onOpenEntry} />
        </li>
        <li>
          Run the check again to rule out a passing fault. A second Broken
          confirms it; a later Intact doesn&apos;t erase the first result, which
          stays in the history.
        </li>
        <li>
          {contact ? (
            <>
              {`Report it to Measured Health's security lead, ${contact.name}, at `}
              <a
                href={`mailto:${contact.email}`}
                className="font-semibold text-mint-deep underline underline-offset-2"
              >
                {contact.email}
              </a>
              , outside the app.
            </>
          ) : (
            "Report it to Measured Health's security lead, outside the app."
          )}{" "}
          The app has already notified the platform team.
        </li>
        <li>
          Export the entries around the break (reason: Security investigation)
          to preserve what is there now.
          {onExport && run.first_broken_at !== null && (
            <div className="mt-1.5">
              <Button variant="ghost" size="sm" onClick={exportAround}>
                Export the entries around the break
              </Button>
            </div>
          )}
        </li>
        <li>
          Record the outcome when the investigation ends: an auditor adds an
          outcome note to the failed check, which itself never changes.
          <OutcomeNote run={run} canWrite={isAuditor(user)} />
        </li>
      </ol>
    </section>
  );
}

/**
 * The Integrity tab (spec §8): the state of the latest check, Run check now,
 * the steps after a failure, and the history. A failure the server keeps
 * open outranks any later result; a running check outranks both.
 */
export function IntegrityTab({
  onOpenEntry,
  onExport,
}: {
  onOpenEntry(id: string): void;
  /** Opens the export dialog, prefilled (Task 8). */
  onExport?: (p: ExportPrefill) => void;
}) {
  const status = useIntegrityStatus();
  const now = useNow();
  const start = useStartCheck();
  const refresh = useRefreshIntegrity();
  const net = useNeedsConnection("integrity-offline");
  const [runId, setRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const tracked = useRun(runId).data ?? null;
  const trackedDone = tracked !== null && tracked.state !== "running";

  // When the check this page started ends, the status and history catch up.
  useEffect(() => {
    if (trackedDone) void refresh();
  }, [trackedDone, tracked?.id, refresh]);

  const run = () => {
    setStartError(null);
    start.mutate(undefined, {
      onSuccess: (r) => setRunId(r.run_id),
      onError: (e) => setStartError(platformError(e).title),
    });
  };

  if (status.isPending) return <Loading label="Loading the integrity check" />;
  if (status.isError && !status.data)
    return (
      <CouldntLoad
        what="the integrity check"
        onRetry={() => void status.refetch()}
      />
    );
  const s = status.data;
  const failure =
    s.open_failure ?? (s.latest?.state === "broken" ? s.latest : null);
  const running =
    tracked?.state === "running"
      ? tracked
      : s.running && !(trackedDone && s.running.id === tracked.id)
        ? s.running
        : null;
  const shown =
    running ?? failure ?? newer(s.latest, trackedDone ? tracked : null);
  const offlineProps = {
    ...net.props,
    disabled: net.offline || start.isPending,
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card-v3 flex flex-col gap-4 px-[22px] py-5">
        <StateBlock run={shown} now={now} onRetry={run} retry={offlineProps} />
        <div>
          <Button {...offlineProps} onClick={run}>
            Run check now
          </Button>
          <OfflineNote id="integrity-offline" />
          {startError && (
            <div className="mt-3">
              <Banner tone="bad" title={startError} />
            </div>
          )}
        </div>
      </section>
      {failure && (
        <Steps
          run={failure}
          contact={s.security_contact}
          onOpenEntry={onOpenEntry}
          onExport={onExport}
        />
      )}
      <RunHistory />
    </div>
  );
}
