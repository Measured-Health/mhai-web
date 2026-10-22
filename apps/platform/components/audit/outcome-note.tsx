"use client";
import { useId, useState } from "react";
import { OUTCOME_NOTE_MAX } from "@/lib/api/audit-contract";
import type { ReadRun } from "@/lib/audit/read";
import { platformError } from "@/lib/errors";
import { dateLabel } from "@/lib/format";
import { useAddOutcome, useRefreshIntegrity } from "@/lib/queries/audit";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

/** The outcome once recorded: who, when, and the note. */
function Recorded({ outcome }: { outcome: NonNullable<ReadRun["outcome"]> }) {
  return (
    <div className="mt-2 rounded-xl border border-line bg-white px-3 py-2.5">
      <p className="text-[13px] font-semibold text-ink-2">
        {`Outcome recorded by ${outcome.by.name} · ${dateLabel(outcome.at)}`}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words">{outcome.note}</p>
    </div>
  );
}

/**
 * Step 6: the outcome of the investigation, on the failed check (spec §8.3).
 * Only auditors write it; the server refuses anyone else. The note is a new
 * entry: the failed check itself never changes. Once recorded, everyone
 * sees it.
 */
export function OutcomeNote({
  run,
  canWrite,
}: {
  run: ReadRun;
  canWrite: boolean;
}) {
  const id = useId();
  const add = useAddOutcome();
  const refresh = useRefreshIntegrity();
  const net = useNeedsConnection(`${id}-offline`);
  const [note, setNote] = useState("");
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (run.outcome) return <Recorded outcome={run.outcome} />;
  if (!canWrite || run.id === null) return null;
  const runId = run.id;
  const trimmed = note.trim();

  const save = () => {
    if (!trimmed) return;
    setStale(false);
    setFailed(null);
    add.mutate(
      { runId, note: trimmed, version: run.version },
      {
        onSuccess: () => setNote(""),
        onError: (e) => {
          const w = platformError(e);
          if (w.stale) setStale(true);
          else setFailed(w.title);
        },
      },
    );
  };
  const reload = async () => {
    await refresh();
    setStale(false);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <label htmlFor={`${id}-note`} className="text-[13px] font-semibold">
        Outcome note
      </label>
      <textarea
        id={`${id}-note`}
        value={note}
        maxLength={OUTCOME_NOTE_MAX}
        rows={4}
        aria-describedby={`${id}-count`}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-[14px] focus-visible:outline-2 focus-visible:outline-mint-deep"
      />
      <p id={`${id}-count`} className="text-[12.5px] text-ink-3">
        {`${note.length} / ${OUTCOME_NOTE_MAX}`}
      </p>
      {stale && (
        <Banner tone="warn" title="Changed by someone else">
          <p>Reload to see the latest.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void reload()}
          >
            Reload
          </Button>
        </Banner>
      )}
      {failed && <Banner tone="bad" title={failed} />}
      <div>
        <Button
          size="sm"
          {...net.props}
          disabled={net.offline || !trimmed || add.isPending}
          onClick={save}
        >
          Save outcome
        </Button>
        <OfflineNote id={`${id}-offline`} />
      </div>
    </div>
  );
}
