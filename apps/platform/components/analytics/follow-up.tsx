"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import type { Change } from "@/lib/api/analytics-contract";
import { followUpLine } from "@/lib/analytics/changes";
import { platformError, type PlatformErrorWords } from "@/lib/errors";
import {
  reloadAnalytics,
  useFollowUp,
  useUndoFollowUp,
} from "@/lib/queries/analytics";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

export const NOTE_MAX = 500;
export const NOTE_TOO_LONG = `A note can be ${NOTE_MAX} characters at most.`;

/**
 * Who followed the change up, and (for platform admins) marking it,
 * editing the note (its author only) and undoing it (any platform admin).
 * Auditors see the line and the note, and no controls. Every write sends
 * the change's version: if someone else got there first it's 409, "Changed
 * by someone else", and the page reloads the list.
 */
export function FollowUp({
  change: c,
  canAct,
  isYou,
}: {
  change: Change;
  canAct: boolean;
  /** Whether a follow-up's author is the signed-in person. */
  isYou(by: { id: string; name: string }): boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const mark = useFollowUp();
  const undo = useUndoFollowUp();
  const net = useNeedsConnection("follow-up-offline");
  const titleId = useId();
  const [error, setError] = useState<PlatformErrorWords | null>(null);
  const [editing, setEditing] = useState(false);
  const f = c.follow_up;
  const busy = mark.isPending || undo.isPending;

  const failed = (e: Error) => {
    const w = platformError(e);
    // Someone else changed it meanwhile: show them the latest.
    if (w.stale || w.gone) reloadAnalytics(qc);
    setError(w);
  };

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="text-[14px] font-semibold">
        Follow-up
      </h3>
      {error && (
        <Banner tone={error.stale ? "warn" : "bad"} title={error.title}>
          {error.stale ? (
            <p>Showing the latest.</p>
          ) : error.body ? (
            <p>{error.body}</p>
          ) : null}
        </Banner>
      )}
      {f ? (
        <div className="text-[14px]">
          <p className="font-medium">{followUpLine(f)}</p>
          {f.note && !editing && (
            <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-ink-2 [overflow-wrap:anywhere]">
              {f.note}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[13.5px] text-ink-2">Not followed up yet.</p>
      )}

      {canAct && !f && (
        <NoteForm
          key={`mark-${c.id}`}
          submit="Mark followed up"
          disabled={busy}
          offline={net}
          onSubmit={(note) => {
            setError(null);
            mark.mutate(
              { id: c.id, version: c.version, ...(note ? { note } : {}) },
              {
                onSuccess: () =>
                  toast.show({ title: "Marked followed up", tone: "ok" }),
                onError: failed,
              },
            );
          }}
        />
      )}

      {canAct && f && editing && (
        <NoteForm
          key={`edit-${c.id}`}
          initial={f.note ?? ""}
          submit="Save note"
          disabled={busy}
          offline={net}
          onCancel={() => setEditing(false)}
          onSubmit={(note) => {
            setError(null);
            mark.mutate(
              { id: c.id, version: c.version, note },
              {
                onSuccess: () => {
                  setEditing(false);
                  toast.show({ title: "Note saved", tone: "ok" });
                },
                onError: failed,
              },
            );
          }}
        />
      )}

      {canAct && f && !editing && (
        <div className="flex flex-wrap gap-2">
          {isYou(f.by) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              {...net.props}
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
            >
              {f.note ? "Edit note" : "Add a note"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            {...net.props}
            onClick={() => {
              setError(null);
              undo.mutate(
                { id: c.id, version: c.version },
                {
                  onSuccess: () =>
                    toast.show({ title: "Follow-up undone", tone: "ok" }),
                  onError: failed,
                },
              );
            }}
          >
            Undo
          </Button>
        </div>
      )}
      {canAct && <OfflineNote id="follow-up-offline" />}
    </section>
  );
}

/** The optional note (500 characters at most, with a counter) and its submit. */
function NoteForm({
  initial = "",
  submit,
  disabled,
  offline,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submit: string;
  disabled: boolean;
  offline: ReturnType<typeof useNeedsConnection>;
  onSubmit(note: string): void;
  onCancel?(): void;
}) {
  const id = useId();
  const [note, setNote] = useState(initial);
  const [tooLong, setTooLong] = useState(false);
  const over = note.length > NOTE_MAX;
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (over) {
      setTooLong(true);
      return;
    }
    onSubmit(note.trim());
  };
  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-note`} className="text-[12.5px] text-ink-2">
        Note (optional)
      </label>
      <textarea
        id={`${id}-note`}
        rows={3}
        value={note}
        disabled={disabled || offline.offline}
        aria-invalid={tooLong && over ? true : undefined}
        aria-describedby={`${id}-count${tooLong && over ? ` ${id}-err` : ""}${offline.offline ? " follow-up-offline" : ""}`}
        onChange={(e) => {
          setNote(e.target.value);
          setTooLong(false);
        }}
        className={`${inputClass} py-2.5`}
      />
      <p
        id={`${id}-count`}
        className={over ? "text-[12px] text-bad" : "text-[12px] text-ink-3"}
      >
        {note.length} / {NOTE_MAX} characters
      </p>
      {tooLong && over && (
        <p id={`${id}-err`} role="alert" className="text-[13px] text-bad">
          {NOTE_TOO_LONG}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={disabled} {...offline.props}>
          {submit}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
